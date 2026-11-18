# 在线解压缩工具 — 表面设计契约

## Direction contract

**THESIS**
把首页参考站的结构当作产品入口，而不是第二个介绍页：用户在右侧工作台（移动端在介绍后）直接处理文件，不离开页面。保留已有 yasuo.zip 视觉语言和真实的终端预览外壳。

**OWN-WORLD**
Gentle Mist Blue：雾蓝 `#5B8DEF` 只承担品牌、焦点与高亮，正文保持中性灰；深色主题为墨蓝黑底 + 雾蓝高亮。细边框、紧凑状态行、等宽数据标签、轻微的行 hover。图标统一线性风格。主按钮实心雾蓝，次按钮描边。

**STORY**
访客首屏看见真实的三模式文件工作区，并能从首页任一 CTA 切换到相应模式；处理期间显示工作状态与真实进度，完成后可搜索、选择、下载结果；主题切换不重置任务。手机滚动到介绍后的同一工作区，所有路径均留在首页。

**FIRST VIEWPORT**
固定导航下使用双栏布局，左侧是像素图标、标题、简介和模式入口，右侧终端窗口直接显示操作区。手机纵向排列，点击模式入口即可定位工作区。

**FORM**
工具工作台式布局（参考 dsh-TUI 的 OWN-WORLD，非界面复刻）：状态行 + 主工作区 + 结果列表。代码优先构建（Operate 模式）。seed: none (pinned)。

**FINISH**
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
