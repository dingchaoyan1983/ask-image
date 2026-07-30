#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import axios from "axios";

// --- config (env vars with defaults from volcengine provider) ---
const BASE_URL =
  process.env.ASK_IMAGE_BASE_URL ||
  "https://opencode.ai/zen/go/v1";
const API_KEY = process.env.ASK_IMAGE_API_KEY || "";
const MODEL =
  process.env.ASK_IMAGE_MODEL || "qwen3.7-plus";
const MAX_TOKENS = parseInt(process.env.ASK_IMAGE_MAX_TOKENS || "4096", 10);

const MAX_IMAGE_DIMENSION = 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const DEFAULT_PROMPT =
  "请详细描述这张图片里的所有内容，包括文字、UI元素、布局、颜色，内外边距，边框，圆角等详细设计信息和数值信息";

// --- helpers ---
function log(message) {
  process.stderr.write(`[ask-image] ${message}\n`);
}

async function toBase64(imagePath) {
  const abs = path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(process.cwd(), imagePath);
  try {
    await fs.access(abs);
  } catch {
    throw new Error(`图片文件不存在: ${abs}`);
  }
  const stat = await fs.stat(abs);
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `图片文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，超过最大限制`
    );
  }
  log(`读取: ${path.basename(abs)} (${(stat.size / 1024 / 1024).toFixed(2)}MB)`);

  let buffer = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase().slice(1);
  const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  const mime = mimeMap[ext] || "image/png";

  // optional resize via sharp (ignore errors if sharp unavailable)
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    const origSize = buffer.length;
    if (meta.width && meta.height) {
      const ratio = Math.max(meta.width, meta.height) / MAX_IMAGE_DIMENSION;
      let pipeline = sharp(buffer);
      if (ratio > 1) {
        log(`压缩尺寸 ${meta.width}x${meta.height} -> ${Math.round(meta.width / ratio)}x${Math.round(meta.height / ratio)}`);
        pipeline = pipeline.resize({
          width: Math.round(meta.width / ratio),
          height: Math.round(meta.height / ratio),
          fit: "inside",
          withoutEnlargement: true,
        });
      }
      buffer = await pipeline.jpeg({ quality: 80 }).toBuffer();
      log(`压缩完成: ${(origSize / 1024).toFixed(1)}KB -> ${(buffer.length / 1024).toFixed(1)}KB`);
    }
  } catch {
    // sharp not available or failed, proceed with original buffer
  }

  log("编码 base64...");
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function callVisionAPI(base64Data, prompt) {
  if (!API_KEY) {
    throw new Error("未配置 ASK_IMAGE_API_KEY 环境变量");
  }
  const t0 = Date.now();
  log(`调用视觉模型 ${MODEL}...`);

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: base64Data } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: MAX_TOKENS,
      thinking: { type: "disabled" },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`视觉 API 调用失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  log(`API 响应成功，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return data.choices[0].message.content;
}

// --- MCP server ---
const server = new Server(
  { name: "mcp-ask-image", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ask_image",
      description:
        "当主模型不支持图片识别时，调用此工具获取图片的文字描述。" +
        "传入图片本地路径，工具会调用视觉模型分析图片并返回详细的文本描述，" +
        "使得纯文本模型能够理解图片内容。" +
        "可用于 UI 设计分析、截图识别、架构图解析等场景。",
      inputSchema: {
        type: "object",
        properties: {
          image_path: {
            type: "string",
            description: "图片文件的本地绝对路径",
          },
          prompt: {
            type: "string",
            description:
              "可选的自定义分析提示词。默认会进行详细的通用图片描述。" +
              "如需针对特定场景（如 UI 设计、代码实现），可指定具体分析方向。",
          },
        },
        required: ["image_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== "ask_image") {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  const schema = z.object({
    image_path: z.string(),
    prompt: z.string().optional(),
  });
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
  }

  const { image_path: imagePath, prompt } = parsed.data;
  const t0 = Date.now();
  log(`开始处理: ${imagePath}`);

  try {
    const base64 = await toBase64(imagePath);
    const result = await callVisionAPI(base64, prompt || DEFAULT_PROMPT);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`完成，耗时 ${elapsed}s`);

    return {
      content: [{ type: "text", text: result }],
    };
  } catch (err) {
    log(`失败: ${err.message}`);
    return {
      content: [
        {
          type: "text",
          text: `ask_image 调用失败: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("ask-image MCP server 已启动");
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
