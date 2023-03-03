import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
    "/",
    { text: "文章", icon: "mdi:note-edit", link: "/article/" },
    {
        text: "系列", icon: "mdi:star", prefix: "/posts/",
        children: [
            {
                text: "Minecraft 睡前杂谈",
                icon: "material-symbols:event-note",
                link: "minecraft/minecraft-talk",
            },
        ],
    },
    {
        text: "分类", icon: "bxs:category", link: "/category/", prefix: "/category/",
        children: [
            { text: "Minecraft", link: "Minecraft", icon: "mdi:minecraft" },
            { text: "前端", link: "前端", icon: "bi:browser-chrome" },
            { text: "后端", link: "后端", icon: "mdi:server" },
            { text: "编程", link: "编程", icon: "mdi:code" },
            { text: "工程化", link: "工程化", icon: "mdi:wrench-cog" },
            { text: "杂项", link: "杂项", icon: "ic:baseline-read-more" },
        ],
    },
    { text: "标签", icon: "mdi:tag", link: "/tag/" },
    { text: "时间轴", icon: "mdi:timeline-clock", link: "/timeline/" },
]);
