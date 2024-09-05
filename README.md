# ohmycert

## 介绍

ohmycert 是一个统一管理证书的工具，支持证书的签发和部署，用于将通过 ACME 签发的通配符证书部署至公有云服务。通过 ohmycert-agent，你可以通过 S3 将统一签发的证书部署至任意机器上。

ohmycert 适合你如果:

- 你想在公有云平台上部署 Let's Encrypt 通配符证书
- or 你不想被爬证书透明度的 Bot/好奇宝宝打扰
- or 你有强迫症想要统一管理所有证书
- or 你有多点部署需求

## Support Matrix

### 证书签发

证书签发通过 [LEGO](https://go-acme.github.io/lego/) 实现，支持大部分常见 DNS 服务商。具体列表请参考 [LEGO DNS Providers](https://go-acme.github.io/lego/dns/index.html)。

### 部署

| 云服务商  | 产品                                                       | 证书部署 | 清理过期证书 |
| --------- | ---------------------------------------------------------- | -------- | ------------ |
| 阿里云    | [CDN](https://help.aliyun.com/zh/cdn/)                     | ✅       | ✅           |
| 阿里云    | [DCDN(全站加速)](https://help.aliyun.com/zh/dcdn/)         | ✅       | ✅           |
| 腾讯云    | [CDN](https://cloud.tencent.com/document/product/228)      | ✅       | ✅           |
| 腾讯云    | [EdgeOne](https://cloud.tencent.com/document/product/1552) | ✅       | ✅           |
| DogeCloud | [CDN](https://www.dogecloud.com/)                          | ✅       | ✅           |

## 快速开始

通过 Docker Compose 可快速启动 ohmycert 服务。

> [!IMPORTANT]  
> 注意: 启动前需要配置好 `config/config.json` 文件中的内容。

```bash
cp config/config.json.example config/config.json
docker-compose up -d
```

### 命令行

```bash
bun src/app.ts run # 执行一次
bun src/app.ts daemon # 启动守护进程
```

### Agent

ohmycert-agent 用于将证书部署至指定机器上，通过 S3 存储证书，ohmycert-agent 会定时拉取证书并通过用户自定义的脚本进行部署。

```bash
# 下载 LLRT JS 运行时，如有 Node 环境可用 Node 替代
wget https://github.com/awslabs/llrt/releases/download/v0.2.1-beta/llrt-linux-x64.zip
unzip llrt-linux-x64.zip
chmod +x llrt
sudo mv llrt /usr/local/bin/llrt

# 下载 ohmycert-agent
sudo wget https://raw.githubusercontent.com/LynMoe/ohmycert/main/agent/dist/ohmycert-agent.js -O /usr/local/share/ohmycert-agent.js
sudo llrt /usr/local/share/ohmycert-agent.js

# 配置 S3
sudo vi /etc/ohmycert/config.json

# 配置脚本
sudo vi /etc/ohmycert/scripts/example.js

# 配置定时任务
sudo crontab -e
# 每小时执行一次
0 * * * * llrt /usr/local/share/ohmycert-agent.js
```

## 配置

```json5
{
  env: "prod", // 可选值: dev, prod。dev 模式下会使用 LE 的 Staging 环境
  storePath: "./data", // 证书和数据库的存储路径，相对于工作目录
  logPath: "./log", // 日志存储路径，相对于工作目录
  legoPath: "/usr/local/bin/lego", // LEGO 可执行文件路径，Docker 中默认为 /usr/local/bin/lego
  daemonCron: "41 4 * * *", // 定时任务执行时间，默认每天 4:41 执行一次
  email: "cert@example.com", // 用于接收证书签发的通知
  configMap: {
    // 配置映射，用于简化重复配置
    legodnspod: {
      LEGO_DISABLE_CNAME_SUPPORT: "true",
      TENCENTCLOUD_SECRET_ID: "",
      TENCENTCLOUD_SECRET_KEY: "",
    },
    tencent: {
      secretId: "",
      secretKey: "",
    },
  },
  certs: [
    // 证书列表，表明需要签发的证书
    {
      name: "allexamplecom", // 证书名称，供内部及部署使用，不可重复，建议使用小写字母和数字
      domains: [
        // 证书域名列表
        "example.com",
        "*.example.com",
      ],
      dnsProvider: "tencentcloud", // 参照 LEGO DNS Providers 文档填写
      envs: {
        // 环境变量，用于指定签发证书时运行 LEGO 的环境变量
        _: "legodnspod", // '_' 为特殊字段，用于指定配置映射，系统会将 configMap 中的相应配置合并到当前配置中
      },
    },
  ],
  destinations: [
    // 证书部署目的地列表，用于将定义的证书部署到指定的云服务商
    {
      cert: "allexamplecom", // 证书名称，对应 certs 中的 name
      domain: "test.example.com",
      destination: "tencenteo", // 证书部署目的地，参照下方服务商列表
      config: {
        // 服务商配置，具体配置内容参照下方服务商列表
        _: "tencent", // 配置映射
        zoneId: "zone-xxxxx", // 除了配置映射外，还可以自定义字段
      },
    },
  ],
  distribution: {
    s3: {
      endpoint: "https://oss-cn-shenzhen.aliyuncs.com",
      region: "cn-shenzhen",
      bucket: "example-bucket",
      path: "a-complex-path",
      accessKey: "",
      secretKey: "",
    },
    agents: [
      // 此处配置需要与 ohmycert-agent 保持一致，有两个预共享密钥，pathKey 用于保护负荷路径，key 用于保护符合内容
      {
        name: "my-edge-node",
        pathKey: "a-complex-path",
        key: "a-complex-key",
        certs: ["allexamplecom"],
      },
    ],
  },
}
```

> [!TIP]
> 配置文件支持热更新，修改配置文件后会自动加载并运行。

> [!TIP]
> 可通过环境变量 `OHMYCERTCONFIG` 来指定配置文件后缀，如 `OHMYCERTCONFIG=dev` 会读取 `config/config.dev.json` 文件。

> [!IMPORTANT]  
> 切换 `env` 字段后需要删除 `storePath` 目录下的 `certs` 目录，否则会导致证书签发失败。

### 阿里云

阿里云产品对应的 `destinations[].config` 配置如下：

```json5
{
  accessKeyId: "",
  accessKeySecret: "",
}
```

**阿里云 CDN**对应的对应的 `destination` 字段为 `alicdn`。

**阿里云 DCDN**对应的对应的 `destination` 字段为 `alidcdn`。

### 腾讯云

腾讯云产品对应的 `destinations[].config` 配置如下：

```json5
{
  secretId: "",
  secretKey: "",
  zoneId: "", // 可选，仅 EdgeOne 需要
}
```

**腾讯云 CDN**对应的对应的 `destination` 字段为 `tencentcdn`。

**腾讯云 EO**对应的对应的 `destination` 字段为 `tencenteo`。

### DogeCloud 多吉云

多吉云产品对应的 `destinations[].config` 配置如下：

```json5
{
  accessKey: "",
  secretKey: "",
}
```

**多吉云 CDN**对应的对应的 `destination` 字段为 `dogecloud`。

## 数据存储

所有证书都保存在 `storePath` 目录下，目录结构如下：

```
data
├── certs
│   ├── lego // LEGO 证书存储目录
│       └── ${cert.name} // 对应证书的 LEGO 子目录
│           ├── accounts
│           └── certificates
│               └── ${cert.domain[0]}.crt
└── db.json // 数据库文件
```

## Contributing

欢迎提交 PR 和 Issue，参与开源项目。

项目 `destinations` 下为服务商的实现，可以参考已有的实现进行开发。对应的新类型需在 `types/destination.ts` 中定义，并在 `app.ts` 中添加逻辑。

## License

MIT
