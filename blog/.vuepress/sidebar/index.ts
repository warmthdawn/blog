import { sidebar } from "vuepress-theme-hope";

export const zhSidebar = sidebar({
  "/": [
    "",
    {
      text: "文章",
      icon: "mdi:note-edit",
      prefix: "posts/",
      children: "structure",
    },
    "intro",
  ],
});

  