import { navbar } from "vuepress-theme-hope";

export const zhNavbar = navbar([
    "/",
    { text: "文章", icon: "note", link: "/article/" },
    {
        text: "系列", icon: "star", prefix: "/posts/",
        children: [
            {
                text: "Minecraft 睡前杂谈",
                icon: "notes",
                link: "minecraft/minecraft-talk",
            },
        ],
    },
    {
        text: "分类", icon: "categoryselected", link: "/category/", prefix: "/category/",
        children: [
            { text: "Minecraft", link: "Minecraft", icon: "minecraft" },
            { text: "前端", link: "前端", icon: "chrome" },
            { text: "后端", link: "后端", icon: "shell" },
            { text: "编程", link: "编程", icon: "code" },
            { text: "工程化", link: "工程化", icon: "structure" },
            { text: "杂项", link: "杂项", icon: "other" },
        ],
    },
    { text: "标签", icon: "tag", link: "/tag/" },
    { text: "时间轴", icon: "time", link: "/timeline/" },
]);
