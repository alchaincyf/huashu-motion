<div align="center">

**简体中文** | [English](README.en.md)

<img src="docs/media/hero.gif" alt="huashu-motion发布片开场：一整面墙的片子，说一句，出一支片" width="100%" />

# huashu-motion

> *「一键直出商业级产品宣传片。」*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-Standard-green)](https://agentskills.io)
[![Runtime](https://img.shields.io/badge/Runtime-Claude%20Code%20·%20Codex%20·%20WorkBuddy%20·%20Grok%20Bot%20·%20Muse%20·%20Dots-blueviolet)](#安装)

**让你的agent做动画、作曲，指着画面改。**

跟Claude Code、Codex这些agent说一句「给我的产品做个30秒的发布片」，<br>
它会先读你的产品，给你三个方向挑，写出整支片子，自己写谱配乐，<br>
然后在浏览器里打开一个编辑器等你。哪里不满意，在画面上点一下，写下要改什么，它就只改那一处。

```sh
npx skills add alchaincyf/huashu-motion
```

[看效果](#看效果) · [安装](#安装) · [能做什么](#能做什么) · [怎么做到的](#怎么做到的) · [背后的故事](#背后的故事)

</div>

---

## 看效果

这篇README里的每一段动画都是huashu-motion做的。上面那段取自它给自己做的53秒发布片，👉 [下载完整发布片（MP4，带声音）](https://github.com/alchaincyf/huashu-motion/releases/latest)，下面Grok Bot（非官方）、huashu-design、DeepSeek、Claude Duet（非官方）这几支的完整版也在同一个页面。

### 指着画面改

<img src="docs/media/point-to-edit.gif" alt="在编辑器里按C，点中开场画面，写下「第一帧开场的效果我觉得很差，还不如核心聚焦在typing呢」，agent接单改完，预览停在原处刷新" width="100%" />

按C，在画面上点一下，写下要改什么。评论发过去的时候带着时间点、场景、点中的元素和它在源码里的位置，agent先把那一帧和你点的那一小块截图放大看一眼，再只改那一处，改完回一句人话，预览停在原来的位置刷新。每一版都留着，⌘Z随时撤回；标题、数字、颜色、停留时长这些会变成编辑器右边的输入框，自己改，不用等agent。

（这段里的编辑器和终端是照真实界面重建的，代码细节是示意；评论是真实提过的意见。）

### 先写谱，再拍片

<img src="docs/media/score-first.gif" alt="agent写的ABC乐谱变成五线谱往前走，红色场景标记落在哪一拍，画面就在哪一拍切" width="100%" />

做发布片用的是作曲家模式：agent按节奏单先写一份谱（ABC记谱法，纯文本的乐谱），谱里的标记对齐每个场景，再由三角钢琴、弦乐和鼓组的采样演奏出来（真乐器采样要先跑一次`om samples build`，不跑就用合成音色）；画面上每个东西落地的那一帧，再配一个音效。配乐全部在本机现场生成，不调用任何收费接口。

### 一天，二十支

<img src="docs/media/sixteen-cuts.gif" alt="16个镜头来自七支不同的片子，按拍子快切" width="100%" />

16个镜头，来自同一天做的七支片子，按拍子切。

<img src="docs/media/grok-bot.gif" alt="Grok Bot粉丝片：Sending to Chief…的气泡钉住不动，背后每个agent各占一屏颜色，最后汇成八宫格" width="100%" />

Grok Bot（粉丝自制，非官方）· 30秒：傍晚交代任务，夜里几个agent各干各的，早上7点手机上收到汇报。这段是汇报一张张送往Chief of Staff的那几拍。

<table><tr>
<td width="50%"><img src="docs/media/huashu-design.gif" alt="huashu-design宣传片：一句「给社区旧书店做一份众筹PPT」钉在画面中间，背后的风格按拍子一格一格地换" width="100%" /><br/>huashu-design 3.0 · 一句提示词钉住不动，背后的风格按拍子换</td>
<td width="50%" align="center"><img src="docs/media/catlight-pro.gif" alt="小猫补光灯Pro竖屏片：八种补光色，一拍换一种" width="60%" /><br/>小猫补光灯Pro · 八种补光色，一拍换一种</td>
</tr></table>

### 不依赖Opus：DeepSeek V4.1 Flash也能做

<img src="docs/media/deepseek-flash.gif" alt="DeepSeek V4.1 Flash做的动效片：鲸鱼logo、MOTION、MASK、GLITCH，一个圆点贯穿全片" width="100%" />

这支22秒的动效片，是把Claude Code背后的模型换成DeepSeek V4.1 Flash（1017版）做的。中间我给了三轮意见（比如加上DeepSeek的鲸鱼logo、删掉几个镜头），带配乐和音效，前后不到半小时，按当时的价格花了1块9毛5（缓存命中率99.4%）。统一的配色、贯穿全片的那颗圆点、卡在124BPM上的配乐，是skill带出来的，我一句都没提过。方法写进了skill，便宜的模型也能拍出像样的片子。

### Claude Duet（粉丝自制，非官方）：一次给足需求，全程没找我确认

<img src="docs/media/claude-duet.gif" alt="Claude Duet粉丝片：像素小人Claude Code在终端里等你敲键，炸散后收拢成Duet的图标，通知先来找你，入夜后一条连笔线穿过各个应用替你把活干完" width="100%" />

Anthropic发布Claude Duet当天做的，29秒英文版。像素小人Claude Code在终端里等你敲键，变形成Duet以后主动来找你，你睡着了它接着干。完整版在[Release页面](https://github.com/alchaincyf/huashu-motion/releases/latest)。

---

## 样片是怎么做出来的

很多人问这些样片用的是什么提示词。下面是我当时的原话，一字没改，语音输入的错字也留着；本机路径和截图换成了方括号里的说明，跟这支片无关的话删掉了，用……标出；圆括号里是我补的上下文。

可以看出来，效果不全来自第一句话：有的片子我一次把需求说清楚，就放手让它做；有的片子我盯着改了好几轮。一句话也能出片，想到这个水准，要么第一句给足，要么后面有人当导演。

<details>
<summary><b>Claude Duet</b>（非官方）· 一份需求、两条追加，中间没有修改意见</summary>

> anthropic刚刚发布了claude duet，我希望你帮我充分调研信息，然后帮我做三个版本的视频 /huashu-motion  
> 版本一：16：9 英文版本，30秒以内  
> 版本二：16：9 中文版本 我希望除了品牌信息外，主要元素都是中文 ，30秒以内  
> 版本三：带中文口播，2：3比例，主要界面内容包含官方英文，以及我们制作的中文版本，目标是发在抖音上给用户介绍Claude duet，1分钟以内
>
> 这三个版本我们都需要体现三个方面，但你可以通过不同的方式强调和和体现：  
> 1、Claude duet和Claude code这种coding agent之间的区别  
> 2、目前的使用门槛：大致是pro、max会员可以用上，但是需要申请waitlist  
> 3、ChatGPT dots、muse、grok bot这三个都是personal agent，一定程度上可以认为面对前面三个personal agent，claude选择了claude duet出击。[一张Claude Code像素形象的截图] 这是Claude code原本的形象，我觉得你可以用一个比较视觉化的，动效出色的语言比较有趣的去表达这件事。  
> 三个版本都需要被认为超过了90分才能算制作完成。以及第三个版本我们做完后，你制作封面和标题简介，然后发到抖音和视频号
>
> 除了huashu-motion之外，你也可以使用 /huashu-video-pipeline  /huashu-art-motion 这两个skill辅助你完成内容创作

随后追加了两条，一条在11秒后，一条在5分钟后：

> 不需要找我做任何确认，请完全独立执行

> 用更多的动效和视觉隐喻去表达，而非用过多的字幕与语言。
>
> 抖音版本里可以用x截图之类的方式辅助口播去表达anthropic刚刚发布了这个新产品

之后除了交代做完发到X，没再给过意见。方向是agent自己选的，「过了90分」由另开的评审agent按评分标准打分，英文版改到第9版拿到91分才交。

</details>

<details>
<summary><b>DeepSeek V4.1 Flash动效片</b> · 一句话＋三轮意见，全程不到半小时</summary>

> 用 /huashu-motion skill尽情展示你的动效制作能力，不要关心传达什么，做尽可能多的快切和不同类型的动效展示，30秒以内。最后展示这个动画是由DeepSeek v4.1 flash 1017制作的即可

做的过程中：

> 哦对，开头也可以加一点DeepSeek的logo、鲸鱼，然后快速转动画

看第1版：

> [截了一帧] 这部分画面动效就去掉吧，我觉得很差，不需要展示。以及最后的结尾也长了一些。我觉得爆点可以更早开始！

看第2版：

> [又截了两帧] 这两个动效画面也可以去掉，很差

之后就没再改过，最后交的是第8版。

</details>

<details>
<summary><b>Grok Bot粉丝片</b> · 一句话＋选方向＋一轮意见</summary>

> 我们去给马斯克新推出的personal agent：grok bot做一个产品发布的宣传片

agent给了三个方向（团队上线、夜班、八只手），推荐用夜班的故事做骨架、中间插一段色块快切、电脑窗口用真界面。我回：

> 没问题，按你的推荐结构

看第4版：

> 整体不错，但是第一帧开场的效果我觉得很差，还不如核心聚焦在typing呢

看第6版：

> 非常非常棒！！我觉得我们的huashu-motion比昨晚又强了很多很多。……

</details>

<details>
<summary><b>huashu-design 3.0发布片</b> · 一句话＋选方向，第一版就过了，后来又往上提</summary>

> 你再打开两个fanbox窗口，分别去做huashu-design、darwin.skill的宣传动画吧。不用要求太多，用上我们最新的huashu-motion skill即可。
>
> ……

看完三个方向的关键帧：

> 我希望a和b结合

看第3版：

> 非常不错！

（agent问片里的「60种风格库」要不要改成84种）

> 可以改！

隔天重看：

> 我们这期视频做得其实非常出色。但是我觉得使用的案例，包括开头的快切，以及后面的三个选择的案例，app的案例等等，多样性都有些不足，很单调。你帮我找找我们最近是否有更好的 /huashu-design 的案例可用。
>
> 以及如果不行的话，你也可以自己调用新的终端窗口，让opus5.5再根据你的影片实现目标和镜头语言需要的设计，去做一些案例。 /huashu-motion 是这次设计的总负责人。
>
> 我希望能把我们这次宣传片的品质再提升100%，这对我们很重要！！！

</details>

<details>
<summary><b>huashu-motion自己的发布片</b> · 最折腾的一支：一个半小时，十个版本</summary>

> ……以及，我觉得我们需要现在，立刻重新做一个 /huashu-motion 的发布动画！！！让它把自己的能力，操作流程，特点都表达清楚，最后展示huashu-motion的仓库地址！

看第2版：

> 还不错，但是有两个问题：  
> 1、我希望开头部分先行做一些快速的切镜，包括不同素材，不同运镜方式，比如一堆素材，3d视角流动，然后快速拉进切出好几个产品发布篇。
>
> 接着开始展示huashu-motion的发布流程！
>
> 然后，我觉得现在的发布流程展示挺清晰的，但是1、2、3、4、5，那切换运动很像ppt，不够高级！

看第3版：

> [两个素材文件夹] 我们这两个文件夹中一大堆素材，你可以选择其中最好的。以及如果觉得还不够的话，可以更进一步！！自己去做一些你认为需要的。
>
> 其实我觉得一个精细化的精密仪器或者生理结构的模型，然后爆炸，环绕之类的会能够展现出非常出色的效果，你可以考虑下

> [一张接触表] 这个感觉还挺多的，不过我希望你注意下素材的丰富性，以及这些素材凭借在一起时的审美表现！

看第7版，连着说了几条：

> [截了一帧] 我觉得01-06这部分依然需要大改，如果乔布斯想要把这个产品发布出去，他会对这部分动画提什么要求？

> 另外，开头的节奏感我觉得很怪！！

> 音乐和视频节奏都不对，需要导演再提一些意见

> （agent说要保留顶部的01–06导航栏）我觉得不应该保留，这一保留就显得很ppt

> （agent说素材墙里有一张真人面孔，先剔除）我们不排斥真人素材

看第8版：

> 37-38秒左右的音乐音效非常奇怪糟糕。像是突然卡了一下，然后断了。我发现别的视频制作也出现类似的问题。我们排查下原因并且修复掉！！！

最后这条后来变成了配乐引擎的一个修复。第10版就是这篇README最上面那段。

</details>

这些意见里反复出现的几条（开场不够强、整段像PPT、节奏平、素材单调），现在已经写进skill：用户只给一句话的时候，agent会先拿这几条自己挑一遍，再把片子给你看。


---

## 安装

### 方式一：跟你的agent说（推荐）

```
帮我安装huashu-motion这个skill（github.com/alchaincyf/huashu-motion），装好后跑一遍demo
```

### 方式二：一行命令

```sh
npx skills add alchaincyf/huashu-motion
```

[skills](https://github.com/vercel-labs/skills)会认出你在用的agent，把skill放进对应目录；要指定的话加`-a claude-code`、`-a codex`等参数。

Claude Code、Codex、WorkBuddy、Grok Bot、Muse、Dots等产品都能跑；它遵循[Agent Skills](https://agentskills.io)协议，支持skill的agent都能装。

### 方式三：克隆整个仓库

<details>
<summary>展开查看</summary>

```sh
git clone https://github.com/alchaincyf/huashu-motion.git
ln -s "$PWD/huashu-motion/skills/huashu-motion" ~/.claude/skills/huashu-motion   # Codex换成~/.codex/skills/
```

skill里的`bin/om`会直接调用仓库里的命令行工具，改仓库就是改skill，本机只有一份。

</details>

### 需要什么

- Node 22以上。
- Chrome（或Chromium、Edge）：截帧、检查、导出都用你电脑上已经装好的浏览器，不额外下载渲染器。
- FFmpeg：导出视频、合成配乐要用。
- 真乐器音色（可选）：想要三角钢琴、弦乐、鼓组，让agent跑一次`om samples build`，下载约55MB的免费采样（CC0和CC-BY授权）；不跑就用合成音色。
- 口播（可选）：macOS的系统音色不用装；想用Kokoro念中文稿，第一次用时会给出一行安装命令（要uv和Python 3.12，模型约325MB）；逐字对齐要装whisper-cli（`brew install whisper-cpp`）。

缺什么跑`om doctor`就知道，这些都可以直接让agent帮你装。目前只在macOS上实测过。Codex的沙箱会拦本地预览和浏览器，遇到时手动批准一下。

---

## 能做什么

装好以后，直接跟agent说：

| 你说 | 它做 |
|---|---|
| 「用huashu-motion给我的产品做一支30秒的发布片，官网是xxx.com」 | 先读产品，出三个方向的关键帧给你挑，写节奏单，再写片、作曲配乐，打开编辑器等你 |
| 「把data/funnel.csv做成30秒解说，讲清楚为什么注册率翻倍了」 | 按数据讲故事：先轴、后数据、只标一件事，数字变成可以直接改的输入框 |
| 「做一支发布片，要口播，用我自己的录音：voice.m4a」 | 逐字对齐，画面落在说到的那个词上，自动出字幕，配乐在说话时让位 |
| 「这条口播视频加个包装」 | 名字条、数字卡、关键词花字、章节卡，导出带透明通道的叠层，直接拖进剪映或Premiere |
| 「改成竖屏」 | 复制一份1080×1920的版本，重新排版的活儿进收件箱，接着改 |
| 「导出GIF」「要透明底」「做成网页分享」 | MP4、MOV（透明）、WebM、GIF；或者导出一个带播放器和源码的分享页 |

开工前，它会先读你以前的偏好和过去片子留下的经验；每支片子做完，再把你这次说过的话、在编辑器里提的评论收一遍，值得留下的记下来。你的偏好只存在你自己电脑上。

导出以后，`om share`会出一个分享包：一张10MB以内的GIF（开头加片尾，可以直接当README头图、发X），和一份写好发帖文案、README头图代码的share.md。4秒以上的片子，最后1.2秒会在片尾空着的角落出现一行小字「Made with huashu-motion」，用这支片自己的字体和颜色；不想要，跟agent说一声就关掉。

---

## 怎么做到的

### 一支片子就是一个`index.html`

画面用代码写，GSAP、Canvas、Three.js、SVG，浏览器能画的都能用；不调用视频生成模型，每一帧只由代码和时间决定。没有私有格式，片子就是一个网页，带走就能用。

```
你的agent ──写──▶ my-film/index.html ◀──盯着── om studio（浏览器里的编辑器）
    ▲                                              │
    └── om inbox --wait ◀── .om/inbox.jsonl ◀── 你在画面上点一下、写一句
```

### 导演规则，不是模板

skill最大的一块是导演方法：先读产品、找出它的气质，再选片子的结构和运动语言。这些规则来自实测，不是拍脑袋：

- 拿21支真实的发布片（Apple、Nothing、GoPro、Google、Vercel、Linear、Anthropic等），用FFmpeg逐支量切点、节拍、响度和能量曲线；
- 拆了142支高互动的发布片和动效片，按产品类型整理出20种运动语言，每种写清楚它在说什么、适合什么产品；
- 每支片子开工前先写一张节奏单：3秒内要有钩子，中段要有一次爆发，最响的那一下前面先停一拍。

颜色也量过：顶级发布片的颜色几乎都是找来的（品牌色、产品外壳和界面、实拍里的光），所以三个方向先从产品里找颜色，`om swatch`把色板和对比度摆出来看。

### 声音是片子的一半

- 作曲家模式：agent写谱，程序用真乐器采样演奏，谱里的场景标记对齐画面；仓库里带了三份有注释的示范谱。
- 兜底配乐：不想作曲，内置12类产品、每类3种配乐方向，按片子的种子挑，不喜欢可以重抽。
- 23种音效：落地、甩镜、打字、盖章、故障……写在动画落地的那一行代码上，导出时自动对上。
- 口播：系统音色念稿，或者用你自己的录音；逐字对齐，画面可以落在某个词上。

### 自己的渲染引擎

渲染、截帧、检查都直接驱动你电脑上的Chrome：按CPU核数开几个浏览器同时渲染（默认最多8个），配乐和画面并行编码，配乐没改就直接复用。一支30秒的片子，在我这台14核的Mac上大约12–15秒渲完；加运动模糊大约1到1.5分钟。

### 交付前有人挑错

- `om check`：渲染前查脚本、缺失的文件、违反规则的动画写法，再抽帧查被裁切、被盖住、对比度不够的字；
- `om qa`：查成片里一闪而过的单帧、没东西在动的空档、硬切和整片的运动曲线；
- skill要求agent交付前真的看帧、按正常速度看一遍，能派独立的agent冷审就派。

### 常用命令

平时都是agent在敲，想自己动手也可以：

| 命令 | 做什么 |
|---|---|
| `om grab` | 把产品的真实素材收进项目：网页截图、logo、配图、品牌色和字体，或本地工程里的截图、图标、录屏 |
| `om new` · `om templates` | 新建项目，可以从12个模板起步 |
| `om studio` | 编辑器：实时预览、场景条、直接改值、在画面上留评论。界面支持中文 / English / Español：跟随浏览器语言，或 `--lang es` / `OM_LANG=es` |
| `om inbox --wait` · `om look` · `om done` | agent那一侧：接下一条评论、看你点的位置、回报改了什么 |
| `om sound` · `om voice` · `om samples` | 配乐和音效、口播、真乐器采样包 |
| `om check` · `om qa` · `om still` | 渲染前检查、成片检查、任意时刻截一帧 |
| `om render` · `om share` · `om export html` · `om fork` | 导出、分享包（GIF＋发帖文案）、分享页、换画幅 |
| `om learn` · `om undo` · `om doctor` | 经验、撤回、环境检查 |

---

## 里面有什么

| | 数量 |
|---|---|
| 运动语言（每种写清楚它在说什么、适合什么、怎么做） | 20种，`skills/huashu-motion/references/library/` |
| 起步模板（发布会、财经图表、动态文字、白板、Vox拼贴、3Blue1Brown、Kurzgesagt、口播包装、界面3D空间、Three.js影棚物体……） | 12个，`templates/` |
| 音效 | 23种 |
| 兜底配乐方向 | 12类产品 × 3种 |
| 示范谱 | 3份，`skills/huashu-motion/references/scores/` |
| 字体（中文500–900字重、衬线、展示字体） | 27款，`fonts/` |
| 方法文档（导演、节奏、颜色、声音、口播、产品演示、验收……） | `skills/huashu-motion/references/` |

```
huashu-motion/
├── skills/huashu-motion/   # skill本体：SKILL.md、方法文档、运动语言库、示范谱、经验
├── cli/                    # om命令行：新建、编辑器、收件箱、配乐、口播、检查、渲染、导出
├── runtime/                # 片子里用的OM.*小工具，和逐帧渲染的引擎
├── studio/                 # 浏览器里的编辑器
├── templates/              # 12个起步模板
├── fonts/                  # 随附的开源字体
├── examples/               # 样片（om demo打开的那支）
└── test/                   # 测试
```

---

## 诚实边界

- 它听不见。agent靠谱面、能量曲线和频谱图检查配乐，最后一耳朵还得是你的。
- 它不会凭空生成真人和实拍。画面全是代码画的；要真人、实拍，用你自己的素材，它负责合成和包装。
- 效果跟模型有关。我主要在Claude Code里用Opus 5.5；DeepSeek V4.1 Flash也能做得不错，但不同模型的品味差别是真实存在的。
- 要能跑命令的环境。预览和导出在本机跑，需要Node、Chrome和FFmpeg。

---

## 背后的故事

2026年10月8号，Anthropic发布了Claude Motion，让Claude用代码把报告、图表、产品讲解做成短动画，可以指着画面改，发布时只在Team和Enterprise上beta。

今年4月Claude Design出来的时候，我把它的核心能力逆向成了skill，就是后来的[huashu-design](https://github.com/alchaincyf/huashu-design)。Motion发布以后，我让Claude Code开工，要求就一句：

> 我们的skill需要能够完整复刻claude motion的能力，并且要强很多！

第一天做出来的东西，我看着都很无聊：编辑器、版本管理、一百多项测试都有了，一个19秒的3D城市样片，运镜很平稳，也就代表着很平庸。让Claude自己把项目审一遍，它的结论是：做出了一个很会证明自己没撒谎的工程，却还没有一个让人想转发的作品。当天推倒重来。

后来真正花时间的，是让片子好看：去量真实的发布片，给配乐提「电影级别」的要求，把每一次「不酷」「无聊」「字体难看」都变成规则写回skill。最后它给自己做了一支发布片，就是这篇README最上面那段。

---

## 致谢

- 动画库[GSAP](https://gsap.com)（GSAP Standard License），随附字体均为SIL OFL 1.1开源字体，清单见`fonts/LICENSES.md`。
- 真乐器采样来自CC0和CC-BY授权的开源采样库，`om samples build`时从原处下载，不随仓库分发；口播用到[Kokoro](https://github.com/thewh1teagle/kokoro-onnx)和[whisper.cpp](https://github.com/ggml-org/whisper.cpp)，第一次用时下载模型。详见[THIRD_PARTY.md](THIRD_PARTY.md)。
- 导演规则里量过、拆过的发布片和动效片，仓库只记测量出来的参数，不含它们的画面。
- `om demo`打开的样片用的是[huashu-art-motion](https://github.com/alchaincyf/huashu-art-motion)的绘画引擎。

---

## 关于作者

**花叔 Huashu** — AI Native Coder，独立开发者，代表作：小猫补光灯（AppStore 付费榜 Top1）

| | |
|:---|:---|
| 🌐 官网 | [bookai.top](https://bookai.top) · [huasheng.ai](https://www.huasheng.ai) |
| 𝕏 Twitter | [@AlchainHust](https://x.com/AlchainHust) |
| 📺 B站 | [花叔v](https://space.bilibili.com/14097567) |
| ▶️ YouTube | [@Alchain](https://www.youtube.com/@Alchain) |
| 📕 小红书 | [花叔](https://www.xiaohongshu.com/user/profile/5abc6f17e8ac2b109179dfdf) |
| 💬 公众号 | 微信搜「花叔」 |

<img src="https://raw.githubusercontent.com/alchaincyf/alchaincyf/main/assets/follow.svg" alt="关注花叔：公众号花叔、B站花叔v、小红书花叔三个二维码" width="100%" />

## 许可证

代码和文档：MIT。随便用，随便改，随便造。

随附的第三方部分保留各自的许可：GSAP（GSAP Standard License）、字体（SIL OFL 1.1），见[THIRD_PARTY.md](THIRD_PARTY.md)。

例外：「豆子花叔」角色（`runtime/clip/lib/toon.js`里的角色绘制，以及它在storytime模板和示范片里的形象）是花叔的卡通形象，只用于本项目的示范，不随MIT授权用于其他用途。

---

<div align="center">

**[女娲](https://github.com/alchaincyf/nuwa-skill)** 造Skill。**[huashu-design](https://github.com/alchaincyf/huashu-design)** 做设计。**[艺术动画](https://github.com/alchaincyf/huashu-art-motion)** 让画动起来。**huashu-motion** 让你的agent拍发布片。

MIT License © [花叔 Huashu](https://github.com/alchaincyf)

</div>

---

<div align="center">
<sub>作者的其他项目 · also by 花叔</sub>

[![FanBox · Coding Agent 的驾驶舱](https://raw.githubusercontent.com/alchaincyf/fanbox/master/assets/promo-banner.jpg)](https://github.com/alchaincyf/fanbox)

</div>
