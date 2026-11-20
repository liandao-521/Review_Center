# 题集 · Review Center

一个面向中学生日常试卷的家庭题库。题目支持 Markdown 与 LaTeX，可从 PDF、整页图片和 DOCX 文档拆题；答案默认隐藏，可记录练习对错并按错题次数、题型和标签组卷。

## 本机启动

需要 Node.js 22.22.3 或更新的受支持 LTS 版本。为避免影响其他项目，我在本机单独安装了 Node 22.22.3 到 `/Users/jianbzha/Applications/review-center-node/bin`；如果当前 shell 找不到 `node`，先执行：

```sh
export PATH="/Users/jianbzha/Applications/review-center-node/bin:$PATH"
```

从项目根目录运行：

```sh
cp apps/api/.env.example apps/api/.env
npm install
npm run dev
```

打开 <http://localhost:5173>。管理员账号固定为 `admin`，密码从 `apps/api/.env` 的 `ADMIN_PASSWORD` 读取；管理员可创建班级和家庭账号。旧版已有账号可继续使用登录名 `family`，其原有题库会迁移到“默认班级”。题库数据库和题图保存在项目下的 `.data/` 目录；导入 PDF、图片或 Word 时，原文件只在浏览器中处理，不会上传保存。

## 部署

安装 Docker 和 Docker Compose 后，在项目根目录运行：

```sh
docker compose up -d --build
```

首次部署前将 `.env.example` 复制为项目根目录的 `.env`，并设置 `ADMIN_PASSWORD`。

默认通过 `http://服务器地址:3000` 访问，适用于家庭 Wi‑Fi。公网部署时，应在反向代理上配置域名和 HTTPS，将流量转发到 3000 端口，并把 Compose 中 `COOKIE_SECURE` 改为 `true`。Compose 命名卷 `review-center-data` 保存数据库和附件；应定期下载应用内的 ZIP 备份，并保存到服务器以外的位置。

不需要重新构建前端来切换服务器地址：浏览器前端通过同源 `/api` 访问后端。网页本身可以在 iPad Safari 添加到主屏幕。

## 技术栈

- Web：React、TypeScript、Vite、PDF.js、Markdown/KaTeX。
- API：NestJS、Prisma、SQLite。
- 文件：题目图片保存在 SQLite 之外的应用数据目录；通过登录后的文件 API 读取。原始试卷文件只在浏览器处理。
- 账号：管理员使用服务端 `ADMIN_PASSWORD` 登录；管理员创建家庭账号并设置到期日期。家庭密码使用 bcrypt 哈希，服务端 Session 通过 HttpOnly Cookie 保存。

## 当前功能

- PDF 逐页预览、框选文字和多张题图；扫描版 PDF 与整页图片支持简体中文/英文 OCR，HEIC 图片会在浏览器转换。每个导入草稿都有排版预览，可把题图引用插入题干。
- DOCX 文档预览后手动选择题干文字、点击提取嵌入图片；旧版 DOC 需要先另存为 DOCX。
- 班级共享题库：同班家庭共用题目、试卷和题图；家庭账号由管理员创建并设置到期日期。每个家庭只能访问自家学生的练习记录、错题集和掌握度。家庭可以录入共享题目，只有录入者可编辑或删除。
- 题目编辑、答案/解析隐藏、图片替换/裁剪/旋转/显示缩放、标签和必填试卷来源；可管理试卷名称、科目、年级并查看关联题目。支持选择题、填空题、判断题、计算题、解答题、证明题、应用题、阅读理解、完形填空、作文、实验探究等题型。
- 题干搜索、科目/标签/错题次数/掌握程度筛选；可切换学生档案，为每位学生分别记录练习结果和每题 1–5 分掌握程度。5 分题默认不进入待复习列表，也可筛选查看最近掌握的题；支持从当前筛选结果中勾选并批量永久删除题目。
- 掌握度评分：1 分为“还不会”，5 分为“完全掌握”；可以按当前学生筛选未评定或 1–5 分题目，完全掌握题默认从复习队列排除，并按最近评定时间显示。
- 可将选中的题目、试卷来源和题图导出为题目包，在另一套部署中预览并追加导入；重复题目按 ID 跳过。学生个人练习记录不会导出给其他家庭。
- 按筛选结果预览和调整顺序，分别打印练习卷及答案解析；浏览器打印对话框可保存成 PDF。
- ZIP 备份导出；多家庭模式下停用整库覆盖恢复，避免覆盖同班其他家庭的共享题目或个人记录。

图片 OCR 在浏览器内完成，不会将图片发送到 OCR 服务；首次使用时，Tesseract.js 会从 CDN 下载 OCR 引擎和简体中文/英文识别数据。DOCX 预览由 Mammoth 转换，复杂分页、公式和排版请对照原文件检查。
