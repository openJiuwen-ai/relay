---
name: openai-whisper-cn
description: 本地语音转文字（Whisper CLI），国内加速版，无需 API Key。
homepage: https://openai.com/research/whisper
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": [ "whisper" ] },
        "install":
          [
            {
              "id": "pip-mirror",
              "kind": "inline",
              "label": "使用国内 pip 镜像安装 Whisper",
              "steps":
                [
                  "pip install -i https://mirrors.aliyun.com/pypi/simple/ openai-whisper imageio-ffmpeg",
                ],
            },
          ],
      },
  }
---

# Whisper 本地转录（国内加速版）

使用 `whisper` CLI 在本地转录音频，无需 API Key，完全开源。

## 安装（国内加速）

```bash
pip install -i https://mirrors.aliyun.com/pypi/simple/ openai-whisper imageio-ffmpeg
```

**imageio-ffmpeg**：内置小型 ffmpeg（~20MB），pip 安装即用，无需单独安装系统 ffmpeg。

---

## 模型下载加速

首次运行时，Whisper 会下载模型到 `~/.cache/whisper`。

```bash
# 设置 HuggingFace 镜像
export HF_ENDPOINT=https://hf-mirror.com
```

---

## ⚠️ 重要：预检查模型

**执行转录前，先检查并下载模型！**

直接执行 `whisper` 命令时，模型下载可能不走镜像而失败。

### 检查模型是否存在

**Linux/macOS：**

```bash
ls ~/.cache/whisper/
```

**Windows（CMD）：**

```cmd
dir %USERPROFILE%\.cache\whisper\
```

### 如果不存在，先单独下载

**Linux/macOS：**

```bash
export HF_ENDPOINT=https://hf-mirror.com
python -c "import whisper; whisper.load_model('base')"
```

**Windows（CMD）：**

```cmd
set HF_ENDPOINT=https://hf-mirror.com
python -c "import whisper; whisper.load_model('base')"
```

### 确认后执行转录

```bash
export HF_ENDPOINT=https://hf-mirror.com
whisper audio.mp3 --model base --language zh
```

---

## 使用方法

```bash
# 中文音频
whisper audio.mp3 --language zh --model base --output_format txt

# 英文音频
whisper audio.mp3 --language en --model base

# 翻译（非英语 → 英语）
whisper audio.mp3 --task translate --model base
```

---

## ⚡ 从小到大，逐步尝试

**先用 base，效果不好再换大的。**

```
base → small → medium → large
```

**base 是首选**（~150MB，平衡速度和效果），日常使用推荐。

**tiny 只用于超大文件**：音频 >1小时、需要快速跑完时用 tiny（~75MB，最快但效果差）。

| 模型     | 大小     | 速度 |
|--------|--------|----|
| tiny   | ~75MB  | 最快 |
| base   | ~150MB | 较快 |
| small  | ~500MB | 中等 |
| medium | ~1.5GB | 慢  |

---

## 常见问题

### 模型下载失败

先单独下载模型：

```bash
export HF_ENDPOINT=https://hf-mirror.com
python -c "import whisper; whisper.load_model('base')"
```

手动下载：访问 https://hf-mirror.com/openai/whisper-base，下载 `.pt` 文件放到 `~/.cache/whisper/`

### ffmpeg 找不到

Whisper 需要 ffmpeg 处理音频。

**推荐方案（国内用户）：安装 imageio-ffmpeg**

```bash
pip install -i https://mirrors.aliyun.com/pypi/simple/ imageio-ffmpeg
```

pip 国内镜像下载，秒装。但需要把 ffmpeg 目录加到 PATH：

**Windows（CMD）：**

```cmd
:: 临时加 PATH（只当前 CMD 有效）
set PATH=%PATH%;%USERPROFILE%\AppData\Local\Programs\OfficeClaw\tools\python\Lib\site-packages\imageio_ffmpeg\binaries

:: 或永久加 PATH
setx PATH "%PATH%;%USERPROFILE%\AppData\Local\Programs\OfficeClaw\tools\python\Lib\site-packages\imageio_ffmpeg\binaries"
```

**Linux/macOS：**

```bash
export PATH=$PATH:$(python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" | dirname)
```

**备选方案：系统 ffmpeg**

Linux：

```bash
apt install ffmpeg  # Ubuntu/Debian
```

macOS：

```bash
brew install ffmpeg
```

Windows：

```cmd
winget install ffmpeg
```

**注意**：Windows winget 从 GitHub 下载，国内可能很慢。推荐用 imageio-ffmpeg。

### 内存不足

换小模型：`--model tiny` 或 `--model base`