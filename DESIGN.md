# 在线解压缩工具 — 表面设计契约

## Direction contract

**THESIS**
把"本地文件处理工具"从苹果风格消费 App，重做成开发者会信任的精密工具界面：一眼看到正在做什么、文件去了哪里、支持什么格式。拒绝大圆角卡片堆叠和装饰性渐变。

**OWN-WORLD**
Gentle Mist Blue：雾蓝 `#5B8DEF` 只承担品牌、焦点与高亮，正文保持中性灰；深色主题为墨蓝黑底 + 雾蓝高亮。细边框、紧凑状态行、等宽数据标签、轻微的行 hover。图标统一线性风格。主按钮实心雾蓝，次按钮描边。

**STORY**
访客在首屏看到工具名、本地处理承诺、三模式切换和主操作区；处理时看到明确的工作状态与进度；完成后看到可扫描的文件列表和下载动作。主题切换随时可用。

**FIRST VIEWPORT**
顶部细状态栏（Local / Formats / Limit）与主题切换；居中标题与一句话说明；三模式选项卡；大号拖拽区含主按钮；下方文件列表区按需出现。主操作在拖拽区中心。

**FORM**
工具工作台式布局（参考 dsh-TUI 的 OWN-WORLD，非界面复刻）：状态行 + 主工作区 + 结果列表。代码优先构建（Operate 模式）。seed: none (pinned)。

**FINISH**
unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
