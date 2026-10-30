# 在自己的服务器部署

300题、解答、公式字体、配套资料均包含在部署包中，无需Sites、ChatGPT登录或OpenAI密钥。自v1.5.0起默认使用Node.js内置SQLite保存学习进度和作答照片，不需要另装数据库服务。

## Docker Compose首次部署

解压新版部署包，进入`ruc802`目录，先复制配置：

```sh
cp .env.example .env
chmod 600 .env
```

编辑`.env`，至少设置`ACCESS_PASSWORD`或`ACCESS_TOKEN`中的一个。密码12至256字符；token为32至256个字母、数字、下划线或短横线。可生成随机token并直接写入配置，避免打印出来：

```sh
node -e "require('node:fs').appendFileSync('.env','\nACCESS_TOKEN='+require('node:crypto').randomBytes(32).toString('base64url')+'\n')"
```

服务器没有Node时，可在有Node的电脑生成配置后上传。不要把`.env`放进网页目录或代码仓库。Compose的`.env`语法中`$`会参与插值，复杂密码可使用单引号包住；随机base64url token不含这些字符。默认端口8080，可修改`SITE_PORT`。配置完成后：

```sh
docker compose pull
docker compose up -d
docker compose ps
curl -f http://127.0.0.1:8080/healthz
```

浏览器打开`http://服务器IP:8080/`，输入访问密码或令牌。公网监听未配置口令时拒绝启动，健康检查正常也不代表题库已对外放行。图片与进度写入`study-data`命名卷内的`/app/data/study.sqlite`；Compose会为卷名加当前项目名前缀。更换项目名或部署目录可能使用新的卷，更新时应保持原项目名。

## 密码、URL token与登录

配置可以只启用密码、只启用token，或同时启用。URL token建议使用片段形式：

```text
https://你的域名/802/#token=你的令牌
```

进入后会换成HttpOnly、SameSite登录凭证并清理地址。也兼容`?token=你的令牌`，验证后立即跳转到不带token的地址；查询参数可能进入反向代理访问日志，优先使用片段形式。口令不要分享给他人：所有获得口令的设备共享同一份学习库，没有多账号隔离。

`ACCESS_SESSION_HOURS`默认168小时，可设1至720。登录有尝试次数限制，写入有来源和CSRF校验。“退出访问”撤销当前登录，其他设备保持各自登录。服务重启后需重新登录；数据库不受影响。更换`.env`口令并重建服务，会使旧登录凭证失效。

公网使用HTTPS；接入HTTPS后将`ACCESS_COOKIE_SECURE=true`，只用HTTPS访问。直接HTTP测试时保持false。若只经本机反向代理访问，将`BIND_ADDRESS=127.0.0.1`。

## 从v1.5或v1.6更新

本轮v1.7.0增加解题辅助图形，沿用v1.5/v1.6的数据库与访问配置。保留自己的`.env`和原数据卷，将`IMAGE`改为`ghcr.io/paimoncai/study-econ:v1.7.0`后执行`docker compose pull`和`docker compose up -d`。无需重复迁移已写入服务器的数据。若此前仍使用v1.4及更早版本，继续按下一节同步更新Compose和访问配置。

## 从v1.4及更早版本更新

1. 先在旧浏览器“设置与备份”导出完整JSON，保留照片；不要清除旧网站数据。
2. 换入v1.7.0部署包中的`compose.yaml`、`.env.example`和部署文件，保留自己的`.env`并补入口令。只修改旧Compose的镜像版本不会自动增加数据卷和访问配置。
3. 将`IMAGE`设为`ghcr.io/paimoncai/study-econ:v1.7.0`，保持原Compose项目名，执行`docker compose pull`和`docker compose up -d`。
4. 登录后打开“设置与备份”，选择“检查并迁移本机旧数据”，预览后确认；或导入刚导出的完整JSON。迁移读取当前网站地址下的旧浏览器存储，网址或端口变更时需通过JSON迁移。
5. 在另一个浏览器登录，确认记录、背诵与照片可见，再继续学习。

迁移不删除旧浏览器数据。导入合并练习记录、收藏、背诵自评和照片，同一记录保留最近修改，同题/同卡草稿以导入文件为准。照片先暂存，确认提交后和进度一起写入；取消或超过容量时不改动实时数据。

## 数据、备份与回退

服务器数据库包含练习记录、错题所依据的自评、收藏、计划日期、阅读设置、历史文字草稿、回忆草稿、背诵进度、当前学习组和作答照片。新浏览器登录即读取服务器数据。页面区分正在保存、已保存、未保存和草稿冲突；不同记录分别合并，同一草稿冲突须选择版本。

localStorage只保留尚未同步改动的应急恢复副本，不是主要学习库；成功同步后删除此副本。照片只有上传成功才算保存，失败时须重新选择。旧浏览器保存模式可通过`STORAGE_MODE=browser`保留作兼容测试，默认部署使用server模式。

日常备份：在设置页导出完整JSON，进度与照片来自同一数据库快照；可导入另一台服务器。下载的文件包含私人学习数据，请自行保管。

服务器备份：先停止服务，再备份整个数据卷，避免只复制正在写入的SQLite主文件而漏掉WAL。以下命令只读取当前Compose项目的数据卷，将压缩包写到当前目录：

```sh
docker compose stop practice
container_id=$(docker compose ps -a -q practice)
docker run --rm --volumes-from "$container_id":ro -v "$PWD:/backup" alpine tar -czf /backup/study-data-backup.tar.gz -C /app/data .
docker compose start practice
```

备份完成后应恢复服务；失败时也执行最后一行。卷包含完整学习库，`.env`和反向代理配置另行保存。普通`docker compose down`保留命名卷；`docker compose down -v`会删除学习数据库，不用于日常更新。

更新到后续版本前保留数据库备份与固定镜像版本，使用相同数据卷。回退先核对数据库版本兼容性；当前遇到未知schema会拒绝修改。v1.4及更早版本没有服务器数据库，直接回退不会把服务器学习记录带回浏览器，应先导出完整JSON。

## 直接使用Node

需要Node.js 24。解压后的成品无需安装npm依赖；保留`serve.mjs`、`access.mjs`、`http-utils.mjs`、`server-data.mjs`、`content/`和`dist/`。复制并配置`.env`后：

```sh
HOST=0.0.0.0 PORT=8080 node --env-file=.env serve.mjs
```

Windows PowerShell：

```powershell
$env:HOST='0.0.0.0'
$env:PORT='8080'
node --env-file=.env serve.mjs
```

直接运行默认数据库为程序目录`data/study.sqlite`，可通过`DATA_DIR`指定独立的绝对路径。仅本机预览可设置`HOST=127.0.0.1`不配置口令；连接公网的反向代理即使上游监听本机，也要配置口令。

Linux长期运行可使用`deploy/ruc802.service`，默认程序`/opt/ruc802`、配置`/opt/ruc802/.env`、数据库`/var/lib/ruc802/study.sqlite`。先创建`ruc802`系统用户并让其可读取程序和配置；systemd的`StateDirectory`创建可写数据目录。按实际Node路径修改`ExecStart`，再安装并启动服务。`.env`由systemd读取，注意使用兼容的简单键值配置。

## HTTPS与子目录

将`deploy/nginx.conf.example`中的location放入已有HTTPS站点配置。根域保持`BASE_PATH`为空；部署到`/802/`时设`BASE_PATH=/802`，代理保留完整路径。示例包含10MB请求限制，适合每批最多3张压缩照片。Cookie路径也随BASE_PATH隔离。

## 源码与验证

```sh
npm ci
npm run build
npm run check
npm test
npx playwright install chromium
npm run test:ui
npm run package
```

测试覆盖原题库、公式、旧浏览器模式，以及认证、数据库重启、不同设备合并、冲突、照片、原子导入、断网恢复与迁移。CI分别在amd64和arm64原生运行器构建，启动根路径、子目录和Compose，并重建服务核验持久化。

仓库为`https://github.com/PaiMonCai/study-econ`。稳定版`ghcr.io/paimoncai/study-econ:latest`，固定版`v1.7.0`，日常版`dev`。main通过验证后发布dev；版本标签与package.json一致时发布正式镜像、latest和部署包。源码构建可叠加`compose.build.yaml`。
