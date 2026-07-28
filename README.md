# ask-image MCP Server

MCP 工具，用于在主模型不支持图片识别时，调用视觉模型获取图片的文字描述。

## 安装

```bash
npm install -g mcp-ask-image
```

安装后即可在全局使用 `ask-image` 命令。

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `ASK_IMAGE_API_KEY` | 是 | - | API 密钥 |
| `ASK_IMAGE_BASE_URL` | 否 | `https://opencode.ai/zen/go/v1` | API 基础地址（兼容 OpenAI 格式） |
| `ASK_IMAGE_MODEL` | 否 | `qwen3.7-plus` | 使用的视觉模型名称 |
| `ASK_IMAGE_MAX_TOKENS` | 否 | `4096` | 最大输出 token 数 |

## 配置示例

### opencode

#### 1. 注册 MCP Server

在 `opencode.json` 的 `mcpServers` 中添加：

```json
{
  "mcpServers": {
    "ask-image": {
      "command": "ask-image",
      "env": {
        "ASK_IMAGE_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### 2. 安装并配置 opencode-easy-vision 插件

**安装插件**（需要 opencode CLI v1.3.4+）：

```bash
# 全局安装（所有项目生效）
opencode plugin opencode-easy-vision --global

# 项目级安装（仅当前目录生效）
opencode plugin opencode-easy-vision
```

或手动在 `opencode.json` 的 `plugins` 数组中添加：

```json
{
  "plugins": [
    "opencode-easy-vision"
  ]
}
```

然后创建 `opencode-easy-vision.jsonc` 配置文件，使不支持识图的模型自动通过此 MCP 分析图片：

```jsonc
{
  // 启用插件的模型列表
  // 通配符: "*" = 所有, "provider/*" = 指定 provider 所有模型,
  // "*/model" = 任意 provider 指定模型, "provider/model" = 精确匹配
  "models": [
    "*"
  ],

  // MCP 工具名称，固定为 ask-image_ask_image
  "imageAnalysisTool": "ask-image_ask_image",

  // 自定义提示模板，支持以下变量:
  //   {imageList}  — 换行分隔的 "- Image N: /path"
  //   {imageCount} — 图片数量
  //   {toolName}   — MCP 工具名
  //   {userText}   — 用户原始文本 (可为空)
  // 设为 null 使用内置默认模板
  "promptTemplate": null,

  // 粘贴图片暂存目录，null 使用系统临时目录 + opencode-easy-vision/
  "tempDir": null,

  // 插件启动时清理超过此小时数的临时文件
  "cleanupAfterHours": 24
}
```

**配置项说明：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `models` | string[] | `["*"]` | 启用插件的模型列表 |
| `imageAnalysisTool` | string | - | MCP 工具名，固定为 `ask-image_ask_image` |
| `promptTemplate` | string | `null` | 自定义提示模板，支持变量插值，`null` 使用默认模板 |
| `tempDir` | string | `null` | 图片暂存目录，`null` 使用系统临时目录 |
| `cleanupAfterHours` | number | `24` | 临时文件过期清理时间（小时） |

### Claude Desktop

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "ask-image": {
      "command": "ask-image",
      "env": {
        "ASK_IMAGE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 工具

### ask_image

当主模型不支持图片识别时，调用此工具获取图片的文字描述。

**参数：**

| 参数 | 必填 | 说明 |
|------|------|------|
| `image_path` | 是 | 图片文件的本地绝对路径 |
| `prompt` | 否 | 自定义分析提示词，默认进行详细通用描述 |

**支持格式：** PNG、JPEG、GIF、WebP

**限制：** 单张图片不超过 20MB，超过 1024px 的图片会自动压缩。
