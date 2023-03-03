---
shortTitle: "Minecraft 睡前杂谈（二）"
tag: ["Minecraft", "Forge", "杂谈", "网络", "同步"]
category: "Minecraft"
date: 2021-11-23T13:43:00+08:00
icon: network
---

# Minecraft 睡前杂谈（二）—— 服务器与客户端：网络模型与数据同步

### Client与Server： Minecraft的网络模型

Minecraft作为一个联机游戏，自然的拥有服务端和客户端，但是我们下面提到的`Client`和`Server`，实际上并不是指的物理层面的“服务器”和“客户端”。即使你在运行单人游戏，你也可以”向局域网开放“来让你的客户端同时作为一个服务器运行。实际上哪怕单人游戏，Minecraft也同样会运行两个独立的线程分别作为'服务端'和”客户端“并使用线程安全的管道代替网络进行通信，而这部分逻辑对于mod是隐藏的。也因此，下文中的”客户端“和”服务器“如没特殊声明均代表逻辑层面的客户端和服务端。

对于客户端和服务端，实际上大部分的逻辑本身都拥有封装完全的API，我们并不需要考虑太多细节层面的实现，相对的，我们需要明确”客户端“和”服务器“各自的职责：

- **服务器**端负责维护世界的“主副本” ，根据从客户端收到的数据包更新方块、实体等，并向所有客户端发送更新的信息。
- **客户端**负责维护世界的”从副本’，读取来自玩家的输入并呈现屏幕的渲染。

也正如因此，任何时候客户端都**不应该**直接读取用户的输入并修改数据，而是应该将用户的输入通知服务端之后等待服务端响应，除非，你完全确信玩家的操作不会对服务器造成影响。

Minecraft的服务端实际上是客户端的代码去掉一部分类文件，这部分代码大部分在`net.minecraft.client`包下并以`@OnlyIn(Dist.Client)`(1.16)或者`@SideOnly(Side.CLIENT)`(1.12)所标记，**不要**在任何有可能在服务端执行的代码中调用这部分类和方法，否则，模组在服务端运行的时候会抛出`ClassNotFound`。针对这种情况，一个比较好的做法是将mod分为两个包`client`和`common`并把客户端相关的代码分开。同时forge提供了`Proxy`(1.12)和`DistExecutor`来处理这种问题，这里就不深入了。

有的代码会同时在服务端和客户端执行（例如`TileEntity`的`update`方法）这类方法我们通常有办法获取一个`World`对象，我们可以通过`world.isRemote`（某些mappings的名字是`level.isClientSide`）属性来判断当前是哪边在执行这个方法，从而选择哪些方法在客户端执行哪些方法在服务端执行。

### 登录阶段的网络数据

##### 1.12的登录校验：`@Mod`注解和`@NetworkCheckHandler`事件

一般情况下，我们不需要也不会去管登录过程的校验，唯一需要做的就是检验服务器mod的版本等操作，这在1.12很容易实现，我们只需要在`@Mod`注解里面额外添加一段参数：

```java
@Mod(modid = MODID,
    name = NAME,
    version = VERSION,
    acceptableRemoteVersions = VERSION_RANGE
)
```

其中，`acceptableRemoteVersions `的参数是服务器允许连接的客户端版本范围，如`[1.2, 1.4)`，不指定这个参数则代表服务器只会允许相同版本的mod连接。

如果你要写一个服务端mod，只需要设置`acceptableRemoteVersions = "*"`，如果你设定的是`serverSideOnly=true`并不能让你的mod在连接服务器的时候不检查客户端是否存在该mod。

如果你要写的是客户端mod，那么你什么都不需要设定，Forge客户端默认不会主动检查服务端的mod。（当然`clientSideOnly`还是要的，这里讨论的只是网络。

如果你想写一个服务端可装可不装的mod（例如JEI），或者单纯希望更详细的控制登录版本的校验，你可以写一个`Handler`

```java
private boolean serverInstalled;

@SideOnly(Side.CLIENT)
public boolean isServerInstalled() {
    return serverInstalled;
}

@NetworkCheckHandler
public boolean checkModLists(Map<String, String> modList, Side remoteSide) {
    //客户端检查服务器的版本
    if (remoteSide == Side.SERVER) {
        serverInstalled = modList.containsKey(MODID);
    }
    //服务器检查客户端的版本，只能没安装或者版本一致
    if (remoteSide == Side.CLIENT && modList.containsKey(MODID)) {
        return VERSION.equals(modList.get(MODID));
    }
    return true;
}
```

这个方法有两个参数，第一个参数是连接方的模组列表和对应的版本，第二个参数表示**对面**是服务器还是客户端，例如，`remoteSide=Side.SERVER`则表示这段代码是运行再客户端上面的。

##### 1.16的登录校验：`NetworkInstance`的构造函数

Forge在1.16中移除了上面提到的所以方法，几乎完全重构了登录过程的数据包。我们已经没用办法在Mod中标记登录校验信息了，相对的，登录校验部分的设置被迁移到了`NetworkInstance`的构造函数中，我们在创建`SimpleChannel`或者`EventNetworkChannel`的时候也会传递这些参数。

```java
INSTANCE = NetworkRegistry.newSimpleChannel(
    new ResourceLocation(MOD_ID, "default_networking"),
    () -> VERSION, //提供当前mod的版本
    (version) -> VERSION.equals(version), //客户端调用，判断服务器的mod版本
    (version) -> VERSION.equals(version)  //服务端调用，判断客户端的mod版本
);
```

如果你希望你的mod是客户端/服务端专属，~~让其直接返回true就行了 *(欸不对啊你都创建自定义数据包了还咋作为单边的mod？) *~~。其实你只要不定义自定义的网络包，Forge就不会检查mod版本啦x

##### 1.16其他登录数据的同步

1.16的Minecraft添加了数据包机制，并且在玩家进入服务器的时候同步数据，Forge也顺水推舟的在自己的新网络机制下添加了同步数据的功能。实际上，大部分登录的数据都是完全有Minecraft和Forge进行管理的（例如玩家数据和Config），因为没什么特别的操作这里就详细说明了。值得一提的是，1.16数据包的设计让部分资源文件以数据包的形式在服务端加载，这其中一部分数据是会在登录阶段向客户端发送的。例如，对于`DynamicRegistry`类型的数据，只需要在构造函数中传递一个`Codec`就可以自动实现网络同步，使用forge注册的配置文件也会自动向客户端同步，服务器的数据包默认也会同步合成表和标签到客户端。如果你希望同步你自定义加载的数据包或者其他配置内容，有以下两种方式：

*下面的代码会涉及到很多自定义网络包相关的内容，如果你对这部分内容不熟悉，可以先看下面部分再回头阅读这一章节*

- 监听`OnDatapackSyncEvent`事件

  `OnDatapackSyncEvent`这一事件会在玩家进入服务器后和`/reload`命令执行后触发，你可以再这个事件里面创建一个自定义的数据包，然后将你需要往客户端同步的内容塞进客户端里面。这部分实现起来非常的简单：

```java
@SubscribeEvent
public static void onDatapackSync(OnDatapackSyncEvent e) {
    if (e.getPlayer() == null) {
        //表示是reload指令触发的，向所有玩家发送数据包
        ModNetworking.INSTANCE.send(PacketDistributor.ALL.noArg(), new DatapackSyncPacket(MyDataManager.data));
        return;
    }
    //是玩家加入游戏触发的，只要向这一个玩家发送数据包就行
    ModNetworking.INSTANCE.send(PacketDistributor.PLAYER.with(e::getPlayer), new DatapackSyncPacket(MyDataManager.data));
}

//处理数据包
public static void handleDatapackSync(DatapackSyncPacket packet, Supplier<NetworkEvent.Context> ctx) {
    ctx.get().enqueueWork(() -> {
        MyDataManager.data = packet.data;
    });
    ctx.get().setPacketHandled(true);
}
```

上面的代码忽略的序列化和反序列化部分，这部分内容将在下一章节详细描述。

- 注册一个FML的`Login`类型的数据包

  Forge在玩家连接服务器的时候添加了一个流程，在这个流程中Forge会发送一些自己的数据包（如模组列表，配置文件等），而1.16的forge也允许我们自定义这一类型的数据包。

  但是，登录数据包和别的数据包不同的是，客户端每收到一个登录数据包**必须**向服务器回复一个数据包响应，这也造成了登录数据包相比于普通数据包需要额外进行一些设定。

  **Forge的登录数据包在连接非常早期进行，如非必要尽量不使用登录数据包，因为这会大幅增加玩家登录服务器所需时间**

  实现登录数据包的流程如下：

  1. 创建一个`SimpleChannel`，这部分内容将在下一章节详细叙述

  2. 声明数据包类，这个类必须实现`java.util.function.IntSupplier`接口 *（你可以定义一个抽象的`LoginPacket`类）*

     这个接口返回的值是这个登录包的`index`，用于服务器判断客户端是否回复了这个登录数据包，同时因为这个`index`是数据包发送之前自动添加的所以我们也需要提供修改这个值的接口。这个包通常是这个亚子的：

```java
public class LoginPacket implements IntSupplier {
    private int loginIndex;

    void setLoginIndex(final int loginIndex) {
        this.loginIndex = loginIndex;
    }

    int getLoginIndex() {
        return loginIndex;
    }

    @Override
    public int getAsInt() {
        return getLoginIndex();
    }

}

public class TestLoginPacket extends LoginPacket {

    public TestLoginPacket(PacketBuffer buffer) {
        //TODO
    }

    public TestLoginPacket() {
        //TODO
    }

    public void toBytes(PacketBuffer buf) {
        //TODO
    }

    public void handler(Supplier<NetworkEvent.Context> ctx) {
        if(ctx.get().getDirection() == NetworkDirection.LOGIN_TO_CLIENT){
            ctx.get().enqueueWork(() -> {
                //TODO：xxx
            });
        }
        ctx.get().setPacketHandled(true);
    }
}
```

3. 创建一个响应的数据包，这个数据包同样也需要实现`IntSupplier`接口，嘛，因为这个包只是个通知当然可以什么都不写

```java
public class LoginReplyPacket extends LoginPacket {

    public LoginReplyPacket(PacketBuffer buffer) {
    }

    public LoginReplyPacket() {
    }

    public void toBytes(PacketBuffer buf) {
    }
}
```

4. 注册网络包，相较于普通的网络包，你需要额外指定`loginIndex`参数并且处理包的时候也需要调用一些Forge的方法

```java
INSTANCE.messageBuilder(LoginReplyPacket.class, nextID(), NetworkDirection.LOGIN_TO_SERVER)
    .loginIndex(LoginPacket::getLoginIndex, LoginPacket::setLoginIndex)
    .encoder(LoginReplyPacket::toBytes)
    .decoder(LoginReplyPacket::new)
    .consumer(FMLHandshakeHandler.indexFirst(((h, packet, ctx) -> {
        LOG.debug("Received client login reply {}", packet.getLoginIndex());
        ctx.get().setPacketHandled(true);
    })))
    .add();

INSTANCE.messageBuilder(TestLoginPacket.class, nextID(), NetworkDirection.LOGIN_TO_CLIENT)
    .loginIndex(LoginPacket::getLoginIndex, LoginPacket::setLoginIndex)
    .encoder(TestLoginPacket::toBytes)
    .decoder(TestLoginPacket::new)
    .consumer((packet, ctx) -> {
        LOG.debug("Received server login packet {}", packet.getLoginIndex());
        packet.handler(ctx);
        INSTANCE.reply(new LoginReplyPacket(), ctx.get());
    })
    .markAsLoginPacket()
    .add();
```

`loginIndex`和我们刚刚提到的`index`有关，你需要向他传递`index`的getter和setter。

自定义的网络包需要添加`markAsLoginPacket`标记，这样Forge在登录的时候就会自动创建一个数据包并发送给客户端。

如果你的数据包不是无参构造函数，那么你可以使用`buildLoginPacketList`代替`markAsLoginPacket`：

```java
buildLoginPacketList(isLocal -> {  //isLocal参数表示的是单人游戏还是联机游戏，从而你可以视情况忽略部分数据的同步
    List<Pair<String, TestLoginPacket>> packets = new ArrayList<>();
    //这里可以添加多个包，forge会非常智能的将他们合并成一个网络包发给客户端
    //Key别重复就行
    packets.add(Pair.of("MyData_1", new TestLoginPacket(MySyncedData.data)));
    return packets;
})
```

同时，客户端响应的包**不要**添加`markAsLoginPacket`，因为这个并不是由服务器在登录过程发给客户端的数据包，但是它需要`loginIndex`。

接着，我们上面说过，每一个登录数据包都需要客户端去响应，所以登录数据包的最后你需要主动向服务器发送任意一个带有`loginIndex`的数据包，一般我们会创建一个空的数据包作为响应数据包。同时，你也可以选择在这个时候拒绝服务器的连接，直接在这时断开连接就行：

```java
ctx.get().getNetworkManager().disconnect(new StringTextComponent("Disconnected: some reason"));
```

最后，我们的登录数据包只是一个普通的数据包，我们需要告诉Forge当他收到这个数据包的时候表示客户端响应了某个之前发过的登录数据包：上面的例子已经写出来了，用`FMLHandshakeHandler.indexFirst`包装一下我们的handler（注意这会让handler方法的签名有所变化），Forge会在这个方法内部标记某个登录包已经被响应。

```java
.consumer(FMLHandshakeHandler.indexFirst(((h, packet, ctx) -> {
    LOG.debug("Received client login reply {}", packet.getLoginIndex());
    ctx.get().setPacketHandled(true);
})))
```

好终于完事了，看起来挺麻烦的不是吗x

### `SimpleChannel`/`SimpleNetworkWrapper`与自定义网络数据包

终于来到了大家心心念念的自定义网络数据包了，Forge在原版的基础上为我们封装了一套网络框架，我们只需要简单的几个步骤：

1. 创建一个网络传输的频道
2. 创建一个实体类用来表示需要传输的数据包
3. 提供一套序列化/反序列化方法
4. 定义服务器/客户端在收到对面发来的数据包后应当进行怎样的操作
5. 注册网络包
6. 发送网络包

因为1.12和1.16代码相差较大，我们分开说明各自的具体实现。

##### 1.12的自定义数据包：`SimpleNetworkWrapper`

我们直接调用`NetworkRegistry.INSTANCE.newSimpleChannel(channelName)`就可以创建一个网络频道

```java
public class ModNetwork {
    public static SimpleNetworkWrapper INSTANCE;
    public static void registerMessages() {
        INSTANCE = NetworkRegistry.INSTANCE.newSimpleChannel(MOD_ID);
    }
}
```

别忘了在`preinit`里面调用哦。

```java
public void preInit(FMLPreInitializationEvent event) {
    ModNetwork.registerMessages();
}
```

接着创建数据包的实体类，这个类需要实现`IMessage`接口，同时**这个类必须存在一个无参数的构造函数**。例如，我们想要把向客户端同步一个区块的灵气（只讨论网络包的内容，更多别的内容会在下面`Capability`的同步部分说明）

我们灵气采用一个double来存储，同时我们还需要知道具体同步的是哪个区块，因此我们的数据包里面还要包括区块的坐标。

```java
public class PacketChunkAura implements IMessage {
    private int chunkX;
    private int chunkZ;
    private double aura;

    public PacketChunkAura(int chunkX, int chunkZ, double aura) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.aura = aura;
    }

    public PacketChunkAura() {

    }

    @Override
    public void fromBytes(ByteBuf buf) {
        this.chunkX = buf.readInt();
        this.chunkZ = buf.readInt();
        this.aura = buf.readDouble();
    }

    @Override
    public void toBytes(ByteBuf buf) {
        buf.writeInt(this.chunkX);
        buf.writeInt(this.chunkZ);
        buf.writeDouble(this.aura);
    }
}
```

注意到上面类里面的`fromBytes`和`toBytes`方法吗，这两个方法就是网络包的序列化/反序列化方法。顾名思义，`fromBytes`就是将网络的字节包反序列化成对象，而`toBytes`则是将对象序列化成字节包。`ByteBuf`方法提供了一些读取/写入的基本方法，后面我也会提供一些常见类型的序列化/反序列化方法。你唯一需要注意的是**序列化和反序列化的顺序必须完全一致**。

Mojang为我们封装了一部分序列化、反序列化方法，这些方法都在`PacketBuffer`类里面，它的用法也很简单，包装一下就行：

```java
PacketBuffer wrapped = new PacketBuffer(buf);
BlockPos blockPos = wrapped.readBlockPos();
NBTTagCompound nbtTagCompound = wrapped.readCompoundTag();
ItemStack itemStack = wrapped.readItemStack();
```

如果你需要序列化/反序列化一个数组，你可以先读/写一个整数代表数组的长度然后再进行一次循环。

然后就是定义服务器在客户端对数据包的处理，我们需要一个`IMessageHandler`，我们可以把这个类作为Message的内部类， 也可以直接让IMessage类实现这个接口

```java
public class PacketChunkAura implements IMessage {
	//.........
	
    public static class Handler implements IMessageHandler<PacketChunkAura, IMessage> {
        @Override
        public IMessage onMessage(PacketChunkAura message, MessageContext ctx) {
            //TODO:实现
        }
    }
}

public class PacketChunkAura implements IMessage, IMessageHandler<PacketChunkAura, IMessage> {
	//........

    @Override
    public IMessage onMessage(PacketChunkAura message, MessageContext ctx) {
        //TODO:实现
    }
}
```

当然，你也可以直接写一个普通的方法，因为这个类同样可以作为`lambda`表达式来处理，我也推荐这种写法：

```java
public static class PacketChunkAura implements IMessage {
	//.........
	
    public IMessage handle(MessageContext ctx) {
        Minecraft mc = Minecraft.getMinecraft();
        mc.addScheduledTask(() -> {
            Chunk chunk = mc.world.getChunk(this.chunkX, this.chunkZ);
            chunk.getCapability(Capabilities.CHUNK_AURA).setAura(this.aura);
        });
        return null;
    }
}
```

这里面的具体实现也很简单，直接获取对应的区块并且写入数据就行，注意这里的`addScheduledTask`，这个的作用我会在后面`线程安全问题`说明。

如果这个数据包在服务端处理，你可以使用`ctx.getServerHandler().player.getServerWorld().addScheduledTask`来代替上面的代码（套娃是吧x)。

最后是注册网络包，还记得我们一开始创建的`SimpleNetworkWrapper`吗，直接调用它的`registerMessage`方法就行：

```java
public class ModNetwork {
    public static SimpleNetworkWrapper INSTANCE;
    private static int ID = 0;
    private static int nextID() {
        return ID++;
    }
    
    public static void registerMessages() {
        INSTANCE = NetworkRegistry.INSTANCE.newSimpleChannel(MOD_ID);
        //INSTANCE.registerMessage(PacketChunkAura.Handler.class, PacketChunkAura.class, nextID(), Side.Client);
        INSTANCE.registerMessage(PacketChunkAura::handler, PacketChunkAura.class, nextID(), Side.Client);
    }
}
```

这个方法有三个参数，第一个参数是包的处理器`handler`，如上面所说的，既可以传一个类也可以传一个`lambda`表达式，第二个参数是数据包的类，第三个参数是数据包的id，这个id在同一个频道内不能重复，我们一般会使用上面的写法来自增id，最后一个参数是数据包的**接收端**。

至此我们数据定义就已经全部完成了，我们可以发送我们的数据包了：

```java
//发送数据包给某个特定玩家
INSTANCE.sendTo(new PacketChunkAura(chunkX, chunkZ, aura), player);
//发送数据包给所有玩家
INSTANCE.sendToAll(new PacketChunkAura(chunkX, chunkZ, aura));
//发送数据包给某个点附近的所有玩家
INSTANCE.sendToAllAround(new PacketChunkAura(chunkX, chunkZ, aura), new NetworkRegistry.TargetPoint(dimID, x, y, z, range));
//发送数据包给所有看见这个实体的玩家
INSTANCE.sendToAllTracking(new PacketChunkAura(chunkX, chunkZ, aura), entity);
//发送数据包给所有看见这个方块的玩家
INSTANCE.sendToAllTracking(new PacketChunkAura(chunkX, chunkZ, aura), new NetworkRegistry.TargetPoint(dimID, x, y, z, 0));
//发送数据包给某个维度的所有玩家
INSTANCE.sendToDimension(new PacketChunkAura(chunkX, chunkZ, aura), dimID);
//发送数据包给服务器
INSTANCE.sendToServer(new AnotherPacket(xxx));
```

##### 1.16的自定义数据包：`SimpleChannel`

1.16的Forge修改了它的设计模式，于是网络的定义采用的`builder`的方案，整体的逻辑于1.12变化不大但是具体的写法更改了许多。

创建频道上面已经提到过了，1.16检测版本也放在了这边。

```java
INSTANCE = NetworkRegistry.newSimpleChannel(
    new ResourceLocation(MOD_ID, "default"),
    () -> VERSION,
    (version) -> version.equals(VERSION),
    (version) -> version.equals(VERSION)
);
```

也可以使用建造者模式：

```java
INSTANCE = NetworkRegistry.ChannelBuilder
    .named(new ResourceLocation(PolymerCoreApi.MOD_ID, "default"))
    .networkProtocolVersion(()->VERSION)
    .clientAcceptedVersions((version) -> version.equals(VERSION))
    .serverAcceptedVersions((version) -> version.equals(VERSION))
    .simpleChannel();
```

1.16的网络包实体现在没有任何限制了，只要是一个类就行，不需要实现某个接口也不需要提供无参的构造函数了

```java
public class PacketChunkAura {
    private int chunkX;
    private int chunkZ;
    private double aura;

    public PacketChunkAura(int chunkX, int chunkZ, double aura) {
        this.chunkX = chunkX;
        this.chunkZ = chunkZ;
        this.aura = aura;
    }

    public PacketChunkAura(PacketBuffer buf) {
        this.chunkX = buf.readInt();
        this.chunkZ = buf.readInt();
        this.aura = buf.readDouble();
    }

    public void toBytes(PacketBuffer buf) {
        buf.writeInt(this.chunkX);
        buf.writeInt(this.chunkZ);
        buf.writeDouble(this.aura);
    }
    
    public void handler(Supplier<NetworkEvent.Context> ctx) {
        if (ctx.get().getDirection() == NetworkDirection.LOGIN_TO_CLIENT) {
            ctx.get().enqueueWork(() -> {
                //TODO：xxx
            });
        }
        ctx.get().setPacketHandled(true);
    }
}
```

```java
INSTANCE.messageBuilder(PacketChunkAura.class, nextID(), NetworkDirection.PLAY_TO_CLIENT)
    .encoder(PacketChunkAura::toBytes)
    .decoder(PacketChunkAura::new)
    .consumer(PacketChunkAura::handler)
    .add();
```

`toBytes`，`fromBytes`，`handler`都是独立定义的，你可以使用lambda表达式或者方法引用来分别表示，因为java方法引用的特点，你可以new和类方法也作为参数。

**1.16的序列化/反序列化方法的参数现在直接是`PacketBuffer`而不是`ByteBuf`了**

`handler`那边也有添加新的改动

- 现在你可以直接调用`enqueueWork`方法了，不需要再去想办法获取`world`对象了。
- handler之后，记得标记`ctx.get().setPacketHandled(true)`告诉forge数据包被处理从而尽早的回收内存。

最后，发送数据包的方法也有所修改，以前的一大堆方法都被换掉了：

```java
//某个玩家
INSTANCE.send(PacketDistributor.PLAYER.with(player), new PacketChunkAura(1,1,1));
//所有人
INSTANCE.send(PacketDistributor.ALL.noArg(), new PacketChunkAura(1,1,1));
//维度
INSTANCE.send(PacketDistributor.DIMENSION.with(RegistryKey.create(new ResourceLocation(dimName))), new PacketChunkAura(1,1,1));
//某个点附近
INSTANCE.send(PacketDistributor.NEAR.with(new PacketDistributor.TargetPoint()), new PacketChunkAura(1,1,1));
//跟踪某个区块的
INSTANCE.send(PacketDistributor.TRACKING_CHUNK.with(()->chunk), new PacketChunkAura(1,1,1));
//跟踪某个实体的
INSTANCE.send(PacketDistributor.TRACKING_ENTITY.with(()->entity), new PacketChunkAura(1,1,1));
//跟踪某个实体的和实体自身（如果这个实体也是玩家）
INSTANCE.send(PacketDistributor.TRACKING_ENTITY_AND_SELF.with(()->entity), new PacketChunkAura(1,1,1));
//服务器（两种写法）
INSTANCE.send(PacketDistributor.SERVER.noArg(), new PacketXxx(xxx));
INSTANCE.sendToServer(new PacketXxx(xxx));
```

##### 手动处理数据包：`EventNetworkChannel`/`FMLEventChannel`

上面的代码中，我们在一个频道中注册了多个数据包，并且让forge帮我们处理和选择数据包，但是其实我们可以完全自定义网络包处理的所有方法，因为这个方法用的不多我就只是提一嘴，如果你对此感兴趣可以去参考jei的代码，它就是用这两个类实现的网络包。

### Minecraft自带的网络同步

嘛，上面说了一吨理论性的废话，那么我们来进行一些实际的操作吧。`Minecraft`默认已经提供了很多网络同步的方法供我们使用，我们一个一个来看。

##### `TileEntity`的网络同步

在说同步的具体实现之前，我们需要明确几件事情：

- 并不是所有数据都是需要向客户端同步的。例如，在箱子的`TileEntity`中，并没有任何和网络同步有关的代码，因为我们在打开箱子之前，并不需要知道箱子里面有什么，也不需要将其发送到客户端，直到我们将打开`GUI`的时候，才需要知道箱子内的物品。（当然，除非你写的是水晶箱子或者物品展示架这种东西）

- 并不是每个`tick`都需要同步网络数据的，大部分时候方块的数据是不变的，只有少部分情况下我们需要向客户端发送数据，通常的做法是在`setXxx`的同时发送一次数据包或者使用`脏标记`模式。
- 同步代码涉及的方面比较多建议造好轮子

###### `getUpdateTag/Packet`和`handleUpdateTag/onDataPacket`

这两组方法是`TileEntity`默认网络同步的方法之一，理论上，这两组方法应该使用完全相同的逻辑。

`getUpdateTag`和`handleUpdateTag`这组方法会在玩家加载区块的时候调用，服务器会批量的向客户端同步数据，而`getUpdatePacket`和`onDataPacket`则是在`world.notifyBlockUpdate`方法被调用之后，服务器向客户端同步单个方块的数据使用的。

在1.12.2中，如果一个区块同时更新的方块超过64个，会把`getUpdatePacket`的调用替换成`getUpdateTag`的调用，但是在1.16并不会这样。

```java
@Override
public NBTTagCompound getUpdateTag() {
    return writeToNBT(new NBTTagCompound());
}
@Override
public SPacketUpdateTileEntity getUpdatePacket() {
    NBTTagCompound nbtTag = this.getUpdateTag();
    return new SPacketUpdateTileEntity(getPos(), 1, nbtTag);
}
@Override
public void handleUpdateTag(NBTTagCompound tag) {
    readFromNBT(tag);
}
@Override
public void onDataPacket(NetworkManager net, SPacketUpdateTileEntity packet) {
    handleUpdateTag(packet.getNbtCompound());
}
```

注意事项：

- `getUpdatePacket`和`onDataPacket`默认的实现是空白，建议一般情况下使用上面的例子直接调用tag那组的实现

- 实际上上面`getUpdateTag`和 `handleUpdateTag`的写法并不好，因为**不是所有的NBT都需要同步到客户端的，这严重造成了网络的浪费**
- 这两个同步方法实际上是”静态“的，Tag系列的方法一般只会在区块加载时调用，Packet系列方法也之是在`notifyBlockUpdate`后调用，如果的方块的数据是动态变化的，你需要添加一些更主动的操作。

###### 脏标记、渲染更新与实时数据同步

其实除了网络同步，还有很多地方用到了脏标记的设计模式，例如，我们在更改`TileEntity`的数据的时候，通常会顺手调用一遍`markDirty`方法（official mapping中这个方法名字叫做`setChanged`），在调用这个方法之后，Minecraft就会自动找机会保存方块数据。在网络同步中，有一个功能类似的方法：

```java
/**
 * Flags are as in setBlockState
 */
public void notifyBlockUpdate(BlockPos pos, IBlockState oldState, IBlockState newState, int flags)
```

通常我们会这样使用这个方法：

```java
this.world.notifyBlockUpdate(this.pos, this.world.getBlockState(this.pos), this.world.getBlockState(this.pos), 3); //1.12
this.getLevel().sendBlockUpdated(this.getBlockPos(), this.getBlockState(), this.getBlockState(), 3); //1.16
```

不过这个方法也有一定问题，它会同步整个方块，包括`BlockState`和`TileEntity`，同时还会额外调用`getBlockState`，如果频繁调用会严重造成资源浪费。我们可以手写一个“`markDirty`”

```java
public void sendToClients() {
    WorldServer world = (WorldServer) this.getWorld();
    PlayerChunkMapEntry entry = world.getPlayerChunkMap().getEntry(this.getPos().getX() >> 4, this.getPos().getZ() >> 4);
    SPacketUpdateTileEntity packet = this.getUpdatePacket();
    if (entry != null && packet != null) {
        entry.sendPacket(packet);
    }
}
private boolean needSync = false;

public void markNetSync() {
    needSync = true;
}

@Override
public void update() {
    if (needSync) {
        sendToClients();
        needSync = false;
    }
}
```

到了这里，实际上你可以不重写`getUpdatePacket`了，发送数据包都自己处理了那么你完全可以不用原版的数据包，自己定义一个新的数据包，具体操作就不演示了。

最后，在1.12中，值得注意的一点，我们之前杂谈一提到过一种写法：重写`getActualState`

```java
@Override
public IBlockState getActualState(IBlockState state, IBlockAccess world, BlockPos pos) {
    TileEntity te = world instanceof ChunkCache 
        ? ((ChunkCache) world).getTileEntity(pos, Chunk.EnumCreateEntityType.CHECK) 
        : world.getTileEntity(pos);
    if (te instanceof MyTileEntity) {
        return state.withProperty(STATE, ((MyTileEntity) te).getState());
    }
    return super.getActualState(state, world, pos);
}
```

如果你直接这样写，你会发现有时候网络更新之后方块的状态并没有更新，你需要主动的在数据变更之后调用渲染更新方法：

```java
@Override
public void onDataPacket(NetworkManager net, SPacketUpdateTileEntity packet) {
    MyState oldState = this.state;
    super.onDataPacket(net, packet);
    if (world.isRemote && oldState != this.state)
        world.markBlockRangeForRenderUpdate(pos, pos);
}
```

###### 增量数据更新

如果你的`TileEntity`非常，非常，非常的复杂，或者某些数据同步的比其他数据更为频繁（例如，你需要做一个量子存储设备，它需要持续消耗RF并提供大规模的物品存储，同时还要在客户端**实时**显示设备的能源状态，设备能量是持续消耗的几乎每tick都会改变，但是容器内物品同步的却没有那么频繁。显然，这种情况下脏标记的同步策略浪费非常严重，对此，一个脏标记不够，那就多来几个，对这些会频繁更新的项目发送单独的数据包，或者你可以在数据包中添加一个`flag`之类的标记来表示这个数据包保存了哪些数据，这样也能一定程度的减小无用数据的同步。

但是如果你选择使用自定义数据包来同步数据，你仍然需要重写`getUpdateTag`系列方法，因为玩家第一次加载方块的时候并不会同步方块（要命.jpg）

有的时候，我们不是使用一个bool类型来表示脏标记，而是直接存储两份数据`data`和`clientData`，每次同步之前更新一下`clientData`，虽然占用的空间可能会大一点点但是可以避免我们因为忘记调用`needSync`造成的一些bug

##### `Gui`的网络同步

相较于`TileEntity`，`Gui`的网络同步实际上要简单的多，当然这里我们的`Gui`特指方块的`Gui`，更具体一点，是`Container`所对应的`Gui`。··

在玩家打开一个`Gui`的时候，MC会同时在服务端和客户端分别创建一个`Container`对象，而我们的网络同步也全部由这个`Container`进行管理，不需要`Gui`部分进行任何操作。

###### 基本的同步方法

和网络同步的相关方法不多，通常我们只需要重写这两个方法：

```java
public void detectAndSendChanges()
public void addListener(IContainerListener listener)
```

在1.16的`official mappings`中，它们是这俩个方法：

```java
public void broadcastChanges()
public void addSlotListener(IContainerListener listener) 
```

`detectAndSendChanges`这个方法会被循环调用，我们在这个方法里面检查有没有需要同步的数据，如果有，就创建一个数据包发送到客户端：

```java
@Override
public void detectAndSendChanges() {
    super.detectAndSendChanges();

    if (!te.getWorld().isRemote) {
        if(this.clientData != te.getData()) {
            this.clientData = te.getData();
            for (IContainerListener listener : listeners) {
                if (listener instanceof EntityPlayerMP) {
                    EntityPlayerMP player = (EntityPlayerMP) listener;
                    ModNetwork.INSTANCE.sendTo(new PacketSyncGuiData(this.clientData), player);
                }
            }
        }
    }
}
```

这里`super`的调用不可以省略，因为里面有容器内物品的同步逻辑。

数据包处理这边，我们只需要把收到的数据给客户端这边的`Container`就行，可以通过`Minecraft`对象获取当前的玩家和玩家正在打开的`GuiContainer`：

```java
Minecraft.getMinecraft().addScheduledTask(() -> {
    EntityPlayerSP player = Minecraft.getMinecraft().player;
    if(player.openContainer instanceof MyContainer) {
        player.openContainer.setData(message.getData());
    }
});
```

最后，我们需要在玩家第一次打开容器的时候主动同步一下数据，这个写在`addListener`中就可以了：

```java
public void addListener(IContainerListener listener)
{
    super.addListener(listener);
    if (listener instanceof EntityPlayerMP) {
        EntityPlayerMP player = (EntityPlayerMP) listener;
        ModNetwork.INSTANCE.sendTo(new PacketSyncGuiData(this.clientData), player);
    }
}
```

###### Minecraft提供的默认通道

当然，如果你需要同步的GUI数据只有`int`类型，你可以使用`Minecraft`的默认通道来代替自定义数据包：

1.12给我们提供了两个方法：

```java
listener.sendWindowProperty(this, DATA_ID, this.data);
```

```
@SideOnly(Side.CLIENT)
@Override
public void updateProgressBar(int id, int data)
{
    if(id == DATA_ID)
}
```

`DATA_ID`是一个随意的数字，只需要你发送和接收的时候一致就行。

1.16则封装的更多，它提供了一个`DataSlot`，可以让整数类型的`Gui`数据和物品一样自动同步*(From 熔炉，稍作修改)*：

```java
public abstract class MyContainer extends Container {
   private int data;
  
   //客户端构造函数
   public MyContainer() {
       super(xxx, xxx)
       
       data = new IntArray(1);
       this.addDataSlots(data);
   }
   //服务端构造函数
   public MyContainer(MyTileEntity te) {
       super(xxx, xxx)
       
       data = new IIntArray() {
            public int get(int i) {
                if(i == 0) return te.getData();
                return 0;
            }

            public void set(int i, int val) {
                if(i == 0) te.setData(val);
            }

            @Override
            public int getCount() {
                return 1;
            }
        };
       this.addDataSlots(data);
   }
}
```

然后，他就可以自动同步了（好耶）。

##### `Capability`、`WorldSaveData`和其他数据的网络同步

###### `Capability`的网络同步

Capability在默认情况下完全不会进行任何网络同步，但是根据Capability的种类我们可以进行不同的操作，例如，如果是`TileEntity`的`Capability`，你可以直接将它的网络同步和`TileEntity`放在一起。而对于物品的内容，你也可以直接写入物品的`NBT`从而让他能自动同步。

至于区块的网络同步，这我们就真的只能自己发送数据包了，实现的逻辑也十分简单粗暴，和上面的思想基本一致，设置一个脏标记，并且在`update`里面检查就行。（没有`update`方法？可以自己监听`TickEvent`事件）：*（From: 自然灵气）*

```java
@SubscribeEvent
public void onWorldTick(TickEvent.WorldTickEvent event) {
    if (!event.world.isRemote && event.phase == TickEvent.Phase.END) {
        if (event.world.getTotalWorldTime() % 20 == 0) {
            event.world.profiler.func_194340_a(() -> NaturesAura.MOD_ID + ":onWorldTick");
            Iterator<Chunk> chunks = event.world.getPersistentChunkIterable(((WorldServer) event.world).getPlayerChunkMap().getChunkIterator());
            while (chunks.hasNext()) {
                Chunk chunk = chunks.next();
                if (chunk.hasCapability(NaturesAuraAPI.capAuraChunk, null)) {
                    AuraChunk auraChunk = (AuraChunk) chunk.getCapability(NaturesAuraAPI.capAuraChunk, null);
                    auraChunk.update();
                }
            }
            event.world.profiler.endSection();
        }
    }
}
```

同时记得监听玩家加载区块事件，当玩家第一次加载区块的时候就把数据送过去：

```java
@SubscribeEvent
public void onChunkWatch(ChunkWatchEvent.Watch event) {
    Chunk chunk = event.getChunkInstance();
    if (!chunk.getWorld().isRemote && chunk.hasCapability(NaturesAuraAPI.capAuraChunk, null)) {
        AuraChunk auraChunk = (AuraChunk) chunk.getCapability(NaturesAuraAPI.capAuraChunk, null);
        PacketHandler.sendTo(event.getPlayer(), auraChunk.makePacket());
    }
}
```

对于`WorldSavedData`之类的数据自然也同理，但是，`WorldSavedData`只存在于服务端，所以我们实际上同步的只有它存储的数据而已，实际上直接同步这种数据并不推荐，更好的做法是客户端发送一个请求数据包然后服务端根据情况来响应客户端的请求。

##### `Entity`的网络同步

Entity的网络同步实际上大部分是自动进行的，少部分涉及到发送数据包的内容也基本上在大部分自定义实体的教程都游戏详细说明这里就不再赘述了。

##### `Item`的网络同步

Minecraft的`Item`只是一个单纯的对象，它自己完全没有主动的网络同步的能力，所有物品的同步全都是由物品所在的容器实现的，大部分情况下我们只需要直接将容器内的物品替换成另一个物品容器就会自动同步，如果不是`Container`内的物品，我们需要根据物品具体存储在什么位置选择对应的实现。

**不要直接修改客户端的物品，而是去通知服务端让服务端去修改**

### 网络同步的相关问题

##### 线程安全问题

还记得我们自定义网络包的时候吗，我们使用了`addScheduledTask`

```java
Minecraft mc = Minecraft.getMinecraft();
mc.addScheduledTask(() -> {
    
});
```

众所周知，mc是一个单线程游戏，但是这个单线程仅仅只是指的是游戏线程，而网络的IO是独立于游戏线程的，所以直接在网络包里面操作world相关的内容就会造成线程安全问题，所以**必须**切换到游戏线程才能安全的操作游戏内的内容。

##### 客户端权限问题

服务器在收到数据包之后，一定要检查客户端权限，一句话是，不要相信客户端发来的任何数据。同时，mc的部分读取操作也会产生副作用，例如在`getBlockState`的时候会加载区块等等，对每一个客户端发来的数据包进行权限检查是个好习惯

##### 同步时机问题

这个其实上面已经有所提及了，我们不能每tick都向客户端发送数据这太浪费了，根据实际需要选择同步的频率和同步的时机。

同时千万不要忘记，除了平时的同步，还有第一次加载区块/进入游戏时候的同步。

##### 其他问题

网络是有延迟的，有的时候，我们在收到数据包之后，数据包所对应的对象已经不存在了（比如方块已经被挖掉了），所以，做好异常处理，警惕NPE