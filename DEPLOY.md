# 在自己的服务器部署

网站独立运行，不需要Sites、ChatGPT登录、OpenAI密钥或数据库。300题、全部解答、公式字体、基础与打印资料都包含在部署包中。服务器不调用外部公式服务。

## 方式一：Docker Compose

把部署压缩包上传服务器并解压，进入`ruc802`目录执行：

```sh
docker compose pull
docker compose up -d
docker compose ps
curl -f http://127.0.0.1:8080/healthz
```

随后在浏览器打开`http://服务器IP:8080/`。服务器防火墙需允许你使用的端口。首次部署拉取GHCR预构建镜像；运行时不需要安装npm依赖或访问外部服务。

改端口时复制`.env.example`为`.env`，例如：

```dotenv
SITE_PORT=8090
BIND_ADDRESS=0.0.0.0
BASE_PATH=
```

如果只给本机反向代理使用，把`BIND_ADDRESS`改为`127.0.0.1`。修改配置后执行`docker compose up -d`。

```sh
docker compose logs --tail=100
docker compose restart
docker compose down
```

## 方式二：直接使用Node

服务器安装Node.js 24，进入解压目录执行即可；预先构建的成品无需`npm install`：

```sh
HOST=0.0.0.0 PORT=8080 node serve.mjs
```

Windows PowerShell：

```powershell
$env:HOST='0.0.0.0'
$env:PORT='8080'
node serve.mjs
```

Linux长期运行可以使用`deploy/ruc802.service`。示例假设程序放在`/opt/ruc802`、Node位于`/usr/bin/node`。先用`command -v node`核对路径；将服务文件的`ExecStart`改为实际Node路径。

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin ruc802
sudo chown -R ruc802:ruc802 /opt/ruc802
sudo cp /opt/ruc802/deploy/ruc802.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ruc802
sudo systemctl status ruc802
```

服务示例默认监听`127.0.0.1:8080`以便接反向代理。需要直接通过服务器IP访问时，改成`HOST=0.0.0.0`，然后`sudo systemctl daemon-reload && sudo systemctl restart ruc802`。已有`ruc802`用户时不用再次创建。

## 域名、HTTPS与子目录

可以把`deploy/nginx.conf.example`中的`location`放进已有的HTTPS站点配置。根域部署保持`BASE_PATH`为空。若要放在`https://你的域名/802/`，设置`BASE_PATH=/802`并使用示例中的子目录代理规则；`proxy_pass`不加尾部斜杠，保留`/802/`路径。静态资源全部使用相对地址。

网站本身没有账户登录，能访问服务器地址的人可以打开题库。个人使用可以部署在内网，或在已有反向代理中加访问认证。学习草稿与练习记录只在各自浏览器中。

## 更新与回退

替换前保留上一版部署包、自定义`.env`与反向代理配置，并记下当前镜像版本。使用预构建镜像时，在`.env`设置目标版本（例如`IMAGE=ghcr.io/paimoncai/study-econ:v1.3.0`），执行`docker compose pull && docker compose up -d`。回退时把`IMAGE`改回之前的固定版本，再执行相同命令。`latest`和`dev`会随发布更新，需要可重复回退时使用固定版本或镜像摘要。

源码构建时换入新版源码和`dist/`，执行`docker compose -f compose.yaml -f compose.build.yaml up -d --build`；直接运行方式换入新版`dist/`和`serve.mjs`后重启Node服务。这两种方式回退时恢复上一版目录，再重新构建容器或重启服务。服务器响应包含缓存校验信息，刷新会获取新版网页；更新网站不会主动清空浏览器进度。

## 学习数据和迁移

当前版本是单站点静态题库，学习数据保存在浏览器，包括草稿、错题、自评、收藏、阅读设置和计划日期。它们不会写入服务器，也不自动跨设备同步。因此无需配置数据库或数据卷。

换域名、端口、浏览器或设备前，在“设置与备份”导出JSON，再在新地址导入。题目数据与服务器文件备份不能代替个人学习记录备份。旧Sites版本的进度也可用同样方式迁移。不要清理旧浏览器数据后再迁移。

## 源码与验证

部署包同时包含源码与题库快照。只有修改题库、重新生成页面公式时才需要安装构建依赖：

```sh
npm ci
npm run build
npm run check
npm test
```

运行本身只需要`serve.mjs`和`dist/`。服务测试覆盖根路径、子目录、健康检查、静态资源、缓存、压缩、PDF范围读取、无效请求和源码路径隔离。实际服务器、Docker镜像构建和反向代理还应在部署目标上验收。


## 镜像与发布约定

仓库：`https://github.com/PaiMonCai/study-econ`。

- 稳定版：`ghcr.io/paimoncai/study-econ:latest`
- 固定版本：`ghcr.io/paimoncai/study-econ:v1.3.0`
- 日常更新：`ghcr.io/paimoncai/study-econ:dev`

在`.env`设置`IMAGE`选择通道。main分支推送通过检查后更新dev；`v*`标签触发版本构建，标签须与package.json版本一致。正式版本更新latest，预发布标签不更新latest。构建在amd64和arm64原生运行器进行，两边容器验证通过后合成平台清单。

需要本地源码构建时：

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

源码构建需要访问基础镜像和npm仓库。如果GHCR包尚未允许匿名拉取，需要先使用拥有读取权限的GitHub账户执行`docker login ghcr.io`。实际匿名拉取能力以仓库发布后的核验结果为准。
