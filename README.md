# ask-image MCP Server

MCP 工具，用于在主模型不支持图片识别时，调用视觉模型获取图片的文字描述。

## 安装

```bash
npm install
npm link
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
