# ohmycert

## 介绍

ohmycert 是一个统一管理证书的工具，支持证书的签发和部署，用于将通过 ACME 签发的通配符证书部署至公有云服务。

## Support Matrix

### 证书签发

证书签发通过 [LEGO](https://go-acme.github.io/lego/) 实现，支持大部分常见 DNS 服务商。具体列表请参考 [LEGO DNS Providers](https://go-acme.github.io/lego/dns/index.html).

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

## 配置

```json
{
  "env": "prod", // 可选值: dev, prod。dev 模式下会使用 LE 的 Staging 环境
  "storePath": "./data", // 证书和数据库的存储路径，相对于工作目录
  "logPath": "./log", // 日志存储路径，相对于工作目录
  "legoPath": "/usr/local/bin/lego", // LEGO 可执行文件路径，Docker 中默认为 /usr/local/bin/lego
  "daemonCron": "41 4 * * *", // 定时任务执行时间，默认每天 4:41 执行一次
  "email": "cert@example.com", // 用于接收证书签发的通知
  "configMap": {
    // 配置映射，用于简化重复配置
    "legodnspod": {
      "LEGO_DISABLE_CNAME_SUPPORT": "true",
      "TENCENTCLOUD_SECRET_ID": "",
      "TENCENTCLOUD_SECRET_KEY": ""
    },
    "tencent": {
      "secretId": "",
      "secretKey": ""
    }
  },
  "certs": [
    // 证书列表，表明需要签发的证书
    {
      "name": "allexamplecom", // 证书名称，供内部及部署使用，不可重复，建议使用小写字母和数字
      "domains": [
        // 证书域名列表
        "example.com",
        "*.example.com"
      ],
      "dnsProvider": "tencentcloud", // 参照 LEGO DNS Providers 文档填写
      "envs": {
        // 环境变量，用于指定签发证书时运行 LEGO 的环境变量
        "_": "legodnspod" // '_' 为特殊字段，用于指定配置映射，系统会将 configMap 中的相应配置合并到当前配置中
      }
    }
  ],
  "destinations": [
    // 证书部署目的地列表，用于将定义的证书部署到指定的云服务商
    {
      "cert": "allexamplecom", // 证书名称，对应 certs 中的 name
      "domain": "test.example.com",
      "destination": "tencenteo", // 证书部署目的地，参照下方服务商列表
      "config": {
        // 服务商配置，具体配置内容参照下方服务商列表
        "_": "tencent", // 配置映射
        "zoneId": "zone-xxxxx" // 除了配置映射外，还可以自定义字段
      }
    }
  ]
}
```

> [!TIP]
> 可通过环境变量 `OHMYCERTCONFIG` 来指定配置文件后缀，如 `OHMYCERTCONFIG=dev` 会读取 `config/config.dev.json` 文件。

> [!IMPORTANT]  
> 切换 `env` 字段后需要删除 `storePath` 目录下的 `certs` 目录，否则会导致证书签发失败。

### 阿里云

阿里云产品对应的 `destinations[].config` 配置如下：

```json
{
  "accessKeyId": "",
  "accessKeySecret": ""
}
```

**阿里云 CDN**对应的对应的 `destination` 字段为 `alicdn`。

**阿里云 DCDN**对应的对应的 `destination` 字段为 `alidcdn`。

### 腾讯云

腾讯云产品对应的 `destinations[].config` 配置如下：

```json
{
  "secretId": "",
  "secretKey": "",
  "zoneId": "" // 可选，仅 EdgeOne 需要
}
```

**腾讯云 CDN**对应的对应的 `destination` 字段为 `tencentcdn`。

**腾讯云 EO**对应的对应的 `destination` 字段为 `tencenteo`。

### DogeCloud 多吉云

多吉云产品对应的 `destinations[].config` 配置如下：

```json
{
  "accessKey": "",
  "secretKey": ""
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
