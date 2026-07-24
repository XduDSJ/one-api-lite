# Reranker 模型 API 格式研究报告

## 1. Qwen3-Reranker 的 API 格式

### 1.1 官方推荐的部署方式

Qwen3-Reranker 支持多种部署方式：

- **vLLM**：推荐用于生产环境，提供高性能推理
- **Ollama**：适合本地部署和实验
- **SentenceTransformers**：适合研究和开发
- **Transformers**：原生支持，灵活性高

### 1.2 API 请求/响应格式

Qwen3-Reranker 采用 **Cohere/Jina 兼容格式**，不是 OpenAI 格式。

#### 1.2.1 请求格式

**端点**：`/v1/rerank`

```json
{
  "model": "qwen3-rerank",
  "query": "What is a reranking model?",
  "documents": [
    "Reranking models are widely used in search engines and recommendation systems to rank candidate texts by relevance",
    "Quantum computing is a frontier field of computational science",
    "The development of pre-trained language models has brought new advances to reranking models"
  ],
  "top_n": 2,
  "instruct": "Given a web search query, retrieve relevant passages that answer the query."
}
```

**请求参数说明**：
- `model`（必填）：模型名称，如 "qwen3-rerank"
- `query`（必填）：查询文本，最大 4,000 tokens
- `documents`（必填）：待排序的文档列表，最多 500 个文档
- `top_n`（可选）：返回排序后的前 N 个文档，默认返回所有文档
- `instruct`（可选）：自定义排序任务指令，建议使用英文

#### 1.2.2 响应格式

```json
{
  "results": [
    {
      "index": 0,
      "relevance_score": 0.999071
    },
    {
      "index": 2,
      "relevance_score": 0.7867867
    }
  ],
  "meta": {
    "api_version": {
      "version": "2"
    },
    "billed_units": {
      "search_units": 1
    }
  }
}
```

**响应字段说明**：
- `results`：排序结果数组，按相关性分数降序排列
- `results[].index`：文档在原始 documents 列表中的位置索引
- `results[].relevance_score`：相关性分数，范围 [0, 1]，分数越高表示越相关
- `meta`：元数据信息，包含 API 版本和计费信息

### 1.3 vLLM 部署 Qwen3-Reranker

#### 1.3.1 部署命令

```bash
vllm serve Qwen/Qwen3-Reranker-8B --host 127.0.0.1 --port 8888 \
  --hf_overrides '{"architectures": ["Qwen3ForSequenceClassification"],"classifier_from_token": ["no", "yes"],"is_original_qwen3_reranker": true}'
```

**关键参数**：
- `--hf_overrides`：必需，用于将原始模型转换为序列分类模型
- `architectures`：指定为 "Qwen3ForSequenceClassification"
- `classifier_from_token`：从 "no" 和 "yes" token 提取分类器
- `is_original_qwen3_reranker`：标记为原始 Qwen3-Reranker 模型

#### 1.3.2 API 调用示例

```python
import requests

url = "http://127.0.0.1:8888/v1/rerank"

# 使用 query_template 和 document_template 格化查询和文档
prefix = '<|im_start|>system\nJudge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>\n<|im_start|>user\n'
suffix = "<|im_end|>\n<|im_start|>assistant\n\n\n"

query_template = "{prefix}<Instruct>: {instruction}\n<Query>: {query}\n"
document_template = "<Document>: {doc}{suffix}"

instruction = "Given a web search query, retrieve relevant passages that answer the query"
query = "What is the capital of China?"

documents = [
    "The capital of China is Beijing.",
    "Gravity is a force that attracts two bodies towards each other. It gives weight to physical objects and is responsible for the movement of planets around the sun.",
]

formatted_documents = [
    document_template.format(doc=doc, suffix=suffix) for doc in documents
]

response = requests.post(url,
    json={
        "query": query_template.format(prefix=prefix, instruction=instruction, query=query),
        "documents": formatted_documents,
    }
).json()

print(response)
```

### 1.4 模型特性

- **模型大小**：0.6B、4B、8B 三种规格
- **上下文长度**：32K tokens
- **支持语言**：100+ 种语言，包括中文、英文、西班牙语、法语等
- **最大文档数**：500 个文档
- **单文档最大 tokens**：4,000 tokens
- **请求最大 tokens**：120,000 tokens

## 2. vLLM 部署 reranker 的 API 格式

### 2.1 vLLM reranker 支持

vLLM 从版本 0.7.1 开始支持 reranker 模型，提供以下端点：

- `/rerank`：原生 rerank 端点
- `/v1/rerank`：OpenAI 兼容端点
- `/v2/rerank`：Cohere v2 兼容端点

### 2.2 API 端点

vLLM 提供 **三个 rerank 端点**：

1. **`/rerank`**：原生端点，Jina/Cohere 兼容
2. **`/v1/rerank`**：OpenAI 兼容端点
3. **`/v2/rerank`**：Cohere v2 兼容端点

### 2.3 请求/响应格式

#### 2.3.1 请求格式

```json
{
  "model": "BAAI/bge-reranker-base",
  "query": "What is the capital of France?",
  "documents": [
    "The capital of Brazil is Brasilia.",
    "The capital of France is Paris.",
    "Horses and cows are both animals"
  ],
  "top_n": 2
}
```

**支持参数**：
- `model`：模型名称
- `query`：查询文本
- `documents`：文档列表
- `top_n`：返回前 N 个结果（可选）
- `max_tokens_per_doc`：单文档最大 tokens（可选）
- `truncate_prompt_tokens`：截断 tokens 数（可选）
- `instruction`：任务指令（可选）

#### 2.3.2 响应格式

```json
{
  "results": [
    {
      "index": 1,
      "relevance_score": 0.999071
    },
    {
      "index": 0,
      "relevance_score": 0.32713068
    }
  ],
  "meta": {
    "api_version": {
      "version": "2"
    },
    "billed_units": {
      "search_units": 1
    }
  }
}
```

### 2.4 兼容性

vLLM 的 rerank API **完全兼容 Cohere 和 Jina 的 rerank API 格式**，这意味着：

- 可以使用 Cohere SDK 直接调用 vLLM rerank 端点
- 可以使用 Jina SDK 直接调用 vLLM rerank 端点
- 请求和响应格式与 Cohere/Jina 一致

### 2.5 部署示例

#### 2.5.1 部署 BGE Reranker

```bash
vllm serve BAAI/bge-reranker-base
```

#### 2.5.2 使用 Cohere SDK 调用

```python
import cohere
from cohere import Client, ClientV2

model = "BAAI/bge-reranker-base"
query = "What is the capital of France?"
documents = [
    "The capital of France is Paris",
    "Reranking is fun!",
    "vLLM is an open-source framework for fast AI serving"
]

# Cohere v1 client
cohere_v1 = cohere.Client(base_url="http://localhost:8000", api_key="sk-fake-key")
rerank_v1_result = cohere_v1.rerank(model=model, query=query, documents=documents)

# Cohere v2 client
cohere_v2 = cohere.ClientV2("sk-fake-key", base_url="http://localhost:8000")
rerank_v2_result = cohere_v2.rerank(model=model, query=query, documents=documents)
```

## 3. TEI (Text Embeddings Inference) 的 rerank API

### 3.1 API 端点

TEI 提供 `/rerank` 端点用于 reranking。

### 3.2 请求/响应格式

#### 3.2.1 请求格式

```bash
curl 127.0.0.1:8080/rerank \
    -X POST \
    -d '{"query":"What is Deep Learning?", "texts": ["Deep Learning is not...", "Deep learning is..."], "raw_scores": false}' \
    -H 'Content-Type: application/json'
```

**请求参数**：
- `query`：查询文本
- `texts`：待排序的文本列表
- `raw_scores`：是否返回原始分数（可选，默认 false）
- `truncate`：是否截断长文本（可选，默认 true）
- `return_text`：是否返回文本内容（可选，默认 false）

#### 3.2.2 响应格式

```json
{
  "ranks": [
    {
      "index": 1,
      "score": 0.95
    },
    {
      "index": 0,
      "score": 0.10
    }
  ],
  "metadata": {
    "model": "BAAI/bge-reranker-large",
    "total_tokens": 100
  }
}
```

### 3.3 部署示例

```bash
docker run --gpus all -p 8080:80 \
  -v $PWD/data:/data \
  ghcr.io/huggingface/text-embeddings-inference:cuda-1.9 \
  --model-id BAAI/bge-reranker-large
```

### 3.4 支持的模型

TEI 支持以下 reranker 模型：

- BAAI/bge-reranker-large
- BAAI/bge-reranker-base
- Alibaba-NLP/gte-multilingual-reranker-base
- Alibaba-NLP/gte-reranker-modernbert-base

### 3.5 与 Cohere/Jina 格式的差异

TEI 的 rerank API **不完全兼容 Cohere/Jina 格式**，主要差异：

1. **参数名称**：TEI 使用 `texts` 而不是 `documents`
2. **响应结构**：TEI 返回 `ranks` 而不是 `results`
3. **字段名称**：TEI 使用 `score` 而不是 `relevance_score`

## 4. Ollama 是否支持 reranker

### 4.1 当前状态

**Ollama 当前不原生支持 reranker 模型**，但有以下进展：

1. **社区 PR 开发中**：多个 PR 正在添加 rerank 支持
2. **llama.cpp 集成**：可以通过 llama.cpp 的 rerank 功能间接支持
3. **实验性分支**：存在实验性分支支持 rerank

### 4.2 社区 PR 状态

#### 4.2.1 PR #11156

- 状态：已关闭
- 内容：尝试在旧引擎中添加 rerank 支持
- 原因：Ollama 已转向新引擎，不再支持旧引擎功能

#### 4.2.2 PR #11389

- 状态：开发中
- 内容：在新引擎（ollamarunner）中实现 rerank 支持
- 进度：已完成核心功能，等待合并

### 4.3 替代方案

#### 4.3.1 使用 llama.cpp

```bash
llama-server --hf-repo klnstpr/bge-reranker-v2-m3-Q8_0-GGUF \
  --hf-file bge-reranker-v2-m3-q8_0.gguf \
  --port 11435 \
  --reranking \
  --pooling rank
```

调用示例：

```bash
curl http://127.0.0.1:11435/v1/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model": "whatever",
    "query": "What is Corona disease?",
    "top_n": 3,
    "documents": [
      "Corona is a Mexican brand of beer produced by Grupo Modelo in Mexico and exported to markets around the world.",
      "it is a bear",
      "COVID-19 is a contagious illness caused by the a virus SARS-CoV-2."
    ]
  }'
```

#### 4.3.2 使用 Ollama 社区分支

```bash
# 1. 克隆特殊分支
git clone https://github.com/sinjab/ollama.git
cd ollama
git checkout reranking-implementation

# 2. 构建
go build .

# 3. 启动服务（需要新引擎标志）
OLLAMA_NEW_ENGINE=1 ./ollama serve

# 4. 创建 reranker 模型
wget https://huggingface.co/mradermacher/Qwen3-Reranker-0.6B-GGUF/resolve/main/Qwen3-Reranker-0.6B.f16.gguf

cat > Modelfile << 'EOF'
FROM ./Qwen3-Reranker-0.6B.f16.gguf
TEMPLATE "{{ .Query }}{{ .Document }}"
PARAMETER temperature 0.0
EOF

./ollama create qwen_reranker -f Modelfile
```

调用示例：

```bash
curl -X POST http://localhost:11434/api/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen_reranker",
    "query": "What is machine learning?",
    "documents": [
      "Machine learning is a subset of artificial intelligence",
      "The weather today is sunny and warm"
    ]
  }'
```

### 4.4 未来展望

Ollama 团队计划在新引擎（ollamarunner）中添加原生 rerank 支持，预计将在未来版本中发布。届时将支持：

- `/api/rerank` 端点
- `/v1/rerank` 端点（OpenAI/Jina 兼容）
- 多种 reranker 模型（BGE、Qwen3 等）

## 5. Cohere /v1/rerank 标准格式

### 5.1 API 端点

- **v1 端点**：`POST https://api.cohere.com/v1/rerank`
- **v2 端点**：`POST https://api.cohere.com/v2/rerank`

### 5.2 请求格式

#### 5.2.1 v1 请求格式

```json
{
  "model": "rerank-v3.5",
  "query": "What is the capital of the United States?",
  "documents": [
    {
      "text": "Carson City is the capital city of the American state of Nevada."
    },
    {
      "text": "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan."
    },
    {
      "text": "Capitalization or capitalisation in English grammar is the use of a capital letter at the start of a word. English usage varies from capitalization in other languages."
    },
    {
      "text": "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district."
    },
    {
      "text": "Capital punishment has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states."
    }
  ],
  "top_n": 3
}
```

**v1 特殊参数**：
- `documents` 可以是字符串数组或对象数组
- 支持结构化数据（YAML 格式）
- `return_documents`：是否返回文档内容
- `rank_fields`：指定排序字段（仅对象文档）

#### 5.2.2 v2 请求格式

```json
{
  "model": "rerank-v4.0-pro",
  "query": "What is the capital of the United States?",
  "documents": [
    "Carson City is the capital city of the American state of Nevada.",
    "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan.",
    "Capitalization or capitalisation in English grammar is the use of a capital letter at the start of a word. English usage varies from capitalization in other languages.",
    "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district.",
    "Capital punishment has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states."
  ],
  "top_n": 3
}
```

**v2 特殊参数**：
- `documents` 只支持字符串数组
- `max_tokens_per_doc`：单文档最大 tokens（默认 4096）
- `priority`：请求优先级（默认 0）

### 5.3 响应格式

#### 5.3.1 v1 响应格式

```json
{
  "results": [
    {
      "index": 3,
      "relevance_score": 0.999071,
      "document": {
        "text": "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district."
      }
    },
    {
      "index": 4,
      "relevance_score": 0.7867867,
      "document": {
        "text": "Capital punishment has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states."
      }
    },
    {
      "index": 0,
      "relevance_score": 0.32713068,
      "document": {
        "text": "Carson City is the capital city of the American state of Nevada."
      }
    }
  ],
  "id": "8bc745a3-7871-4597-822e-18c95d5df48c",
  "meta": {
    "api_version": {
      "version": "1"
    },
    "billed_units": {
      "search_units": 1
    }
  }
}
```

#### 5.3.2 v2 响应格式

```json
{
  "results": [
    {
      "index": 3,
      "relevance_score": 0.999071
    },
    {
      "index": 4,
      "relevance_score": 0.7867867
    },
    {
      "index": 0,
      "relevance_score": 0.32713068
    }
  ],
  "id": "07734bd2-2473-4f07-94e1-0d9f0e6843cf",
  "meta": {
    "api_version": {
      "version": "2",
      "is_experimental": false
    },
    "billed_units": {
      "search_units": 1
    }
  }
}
```

### 5.4 关键参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型标识符，如 "rerank-v3.5" |
| `query` | string | 是 | 搜索查询 |
| `documents` | array | 是 | 待排序的文档列表 |
| `top_n` | integer | 否 | 返回前 N 个结果，默认返回所有 |
| `max_tokens_per_doc` | integer | 否 | 单文档最大 tokens（v2） |
| `return_documents` | boolean | 否 | 是否返回文档内容（v1） |
| `rank_fields` | array | 否 | 排序字段（v1，仅对象文档） |

### 5.5 使用示例

#### 5.5.1 Python SDK

```python
import cohere

co = cohere.Client(api_key="YOUR_API_KEY")

results = co.rerank(
    model="rerank-v4.0-pro",
    query="What is the capital of the United States?",
    documents=[
        "Carson City is the capital city of the American state of Nevada.",
        "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan.",
        "Capitalization or capitalisation in English grammar is the use of a capital letter at the start of a word. English usage varies from capitalization in other languages.",
        "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district.",
        "Capital punishment has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states."
    ],
    top_n=3
)

for result in results.results:
    print(f"Index: {result.index}, Score: {result.relevance_score}")
```

#### 5.5.2 cURL

```bash
curl --request POST \
  --url https://api.cohere.ai/v2/rerank \
  --header 'accept: application/json' \
  --header 'content-type: application/json' \
  --header "Authorization: bearer $CO_API_KEY" \
  --data '{
    "model": "rerank-v4.0-pro",
    "query": "What is the capital of the United States?",
    "documents": [
      "Carson City is the capital city of the American state of Nevada.",
      "The Commonwealth of the Northern Mariana Islands is a group of islands in the Pacific Ocean. Its capital is Saipan.",
      "Capitalization or capitalisation in English grammar is the use of a capital letter at the start of a word. English usage varies from capitalization in other languages.",
      "Washington, D.C. (also known as simply Washington or D.C., and officially as the District of Columbia) is the capital of the United States. It is a federal district.",
      "Capital punishment has existed in the United States since beforethe United States was a country. As of 2017, capital punishment is legal in 30 of the 50 states."
    ],
    "top_n": 3
  }'
```

## 6. Jina /v1/rerank 格式

### 6.1 API 端点

- **端点**：`POST https://api.jina.ai/v1/rerank`

### 6.2 请求格式

```json
{
  "model": "jina-reranker-v3",
  "query": "Organic skincare products for sensitive skin",
  "documents": [
    "Organic skincare for sensitive skin with aloe vera and chamomile: Imagine the soothing embrace of nature with our organic skincare range, crafted specifically for sensitive skin. Infused with the calming properties of aloe vera and chamomile, each product provides gentle nourishment and protection. Say goodbye to irritation and hello to a glowing, healthy complexion.",
    "New makeup trends focus on bold colors and innovative techniques: Step into the world of cutting-edge beauty with this seasons makeup trends. Bold, vibrant colors and groundbreaking techniques are redefining the art of makeup. From neon eyeliners to holographic highlighters, unleash your creativity and make a statement with every look.",
    "Bio-Hautpflege für empfindliche Haut mit Aloe Vera und Kamille: Erleben Sie die wohltuende Wirkung unserer Bio-Hautpflege, speziell für empfindliche Haut entwickelt. Mit den beruhigenden Eigenschaften von Aloe Vera und Kamille pflegen und schützen unsere Produkte Ihre Haut auf natürliche Weise. Verabschieden Sie sich von Hautirritationen und genießen Sie einen strahlenden Teint.",
    "针对敏感肌专门设计的天然有机护肤产品：体验由芦荟和洋甘菊提取物带来的自然呵护。我们的护肤产品特别为敏感肌设计，温和滋润，保护您的肌肤不受刺激。让您的肌肤告别不适，迎来健康光彩。"
  ],
  "top_n": 3,
  "return_documents": false
}
```

**请求参数**：
- `model`：模型名称（jina-reranker-v3、jina-reranker-v2-base-multilingual、jina-colbert-v2）
- `query`：查询文本
- `documents`：文档列表（字符串或对象）
- `top_n`：返回前 N 个结果（可选）
- `return_documents`：是否返回文档内容（可选，默认 true）

### 6.3 响应格式

```json
{
  "model": "jina-reranker-v3",
  "usage": {
    "total_tokens": 2813
  },
  "results": [
    {
      "index": 0,
      "relevance_score": 0.9310624287463884
    },
    {
      "index": 2,
      "relevance_score": 0.8982678574191957
    },
    {
      "index": 1,
      "relevance_score": 0.890233167219021
    }
  ]
}
```

**响应字段**：
- `model`：使用的模型
- `usage`：token 使用统计
- `results`：排序结果
- `results[].index`：文档在原始列表中的位置
- `results[].relevance_score`：相关性分数

### 6.4 与 Cohere 格式的差异

Jina rerank API 与 Cohere 格式基本兼容，但有以下差异：

1. **响应结构**：Jina 返回 `usage` 对象，Cohere 返回 `meta` 对象
2. **字段名称**：基本一致，都使用 `index` 和 `relevance_score`
3. **参数支持**：Jina v2 API 要求 `top_n` 参数，Cohere 可选

#### 6.4.1 Jina v1 vs v2

**Jina v1 API（已废弃）**：
```json
{
  "model": "jina-reranker-v1-turbo-en",
  "query": query,
  "documents": candidates
}
```

**响应**：
```json
{
  "results": [
    {
      "score": 0.95,
      "document": {
        "text": "...",
      }
    }
  ]
}
```

**Jina v2 API（当前）**：
```json
{
  "model": "jina-reranker-v2-base-multilingual",
  "query": query,
  "documents": candidates,
  "top_n": len(candidates)
}
```

**响应**：
```json
{
  "results": [
    {
      "score": 0.95,
      "text": "..."
    }
  ]
}
```

**主要变化**：
- v2 要求 `top_n` 参数
- v2 响应中 `text` 是直接字段，不再嵌套在 `document` 对象中

### 6.5 多模态支持（jina-reranker-m0）

Jina 提供多模态 reranker 模型 `jina-reranker-m0`，支持文本和图像输入。

#### 6.5.1 请求格式

```json
{
  "model": "jina-reranker-m0",
  "query": "slm markdown",
  "documents": [
    {
      "image": "https://raw.githubusercontent.com/jina-ai/multimodal-reranker-test/main/handelsblatt-preview.png"
    },
    {
      "image": "https://raw.githubusercontent.com/jina-ai/multimodal-reranker-test/main/paper-11.png"
    },
    {
      "text": "We present ReaderLM-v2, a compact 1.5 billion parameter language model designed for efficient web content extraction. Our model processes documents up to 512K tokens, transforming messy HTML into clean Markdown or JSON formats with high accuracy -- making it an ideal tool for grounding large language models."
    }
  ],
  "return_documents": false
}
```

#### 6.5.2 响应格式

```json
{
  "model": "jina-reranker-m0",
  "usage": {
    "total_tokens": 2813
  },
  "results": [
    {
      "index": 1,
      "relevance_score": 0.9310624287463884
    },
    {
      "index": 4,
      "relevance_score": 0.8982678574191957
    },
    {
      "index": 0,
      "relevance_score": 0.890233167219021
    }
  ]
}
```

## 7. 阿里/百度 rerank API

### 7.1 阿里通义 rerank API

#### 7.1.1 API 端点

阿里提供两种 API 格式：

1. **OpenAI 兼容格式**：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-api/v1/reranks`
2. **DashScope 格式**：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank`

#### 7.1.2 OpenAI 兼容格式

**请求格式**：

```json
{
  "model": "qwen3-rerank",
  "documents": [
    "文本排序模型广泛用于搜索引擎和推荐系统中，它们根据文本相关性对候选文本进行排序",
    "量子计算是计算科学的一个前沿领域",
    "预训练语言模型的发展给文本排序模型带来了新的进展"
  ],
  "query": "什么是文本排序模型",
  "top_n": 2,
  "instruct": "Given a web search query, retrieve relevant passages that answer the query."
}
```

**响应格式**：

```json
{
  "results": [
    {
      "index": 0,
      "relevance_score": 0.9334521178273196
    },
    {
      "index": 2,
      "relevance_score": 0.5855924673844218
    }
  ],
  "usage": {
    "total_tokens": 100
  }
}
```

#### 7.1.3 DashScope 格式

**请求格式**：

```json
{
  "model": "qwen3-rerank",
  "input": {
    "query": "什么是文本排序模型",
    "documents": [
      "文本排序模型广泛用于搜索引擎和推荐系统中，它们根据文本相关性对候选文本进行排序",
      "量子计算是计算科学的一个前沿领域",
      "预训练语言模型的发展给文本排序模型带来了新的进展"
    ]
  },
  "parameters": {
    "top_n": 2,
    "return_documents": true,
    "instruct": "Given a web search query, retrieve relevant passages that answer the query."
  }
}
```

**响应格式**：

```json
{
  "output": {
    "results": [
      {
      "index": 0,
      "relevance_score": 0.9334521178273196,
      "document": {
        "text": "文本排序模型广泛用于搜索引擎和推荐系统中，它们根据文本相关性对候选文本进行排序"
      }
    },
    {
      "index": 2,
      "relevance_score": 0.5855924673844218,
      "document": {
        "text": "预训练语言模型的发展给文本排序模型带来了新的进展"
      }
    }
    ]
  },
  "usage": {
    "total_tokens": 100
  },
  "request_id": "85ba5752-1900-47d2-8896-23f99b13f6e1"
}
```

#### 7.1.4 支持的模型

阿里支持以下 reranker 模型：

- **qwen3-rerank**：文本 reranker（推荐）
- **qwen3-vl-rerank**：多模态 reranker（支持文本、图像、视频）
- **gte-rerank-v2**：将于 2026-05-30 下线，推荐使用 qwen3-rerank

#### 7.1.5 SDK 调用

```python
import dashscope
from http import HTTPStatus

# 配置 base URL
dashscope.base_http_api_url = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1'

# 调用 rerank API
resp = dashscope.TextReRank.call(
  model="qwen3-rerank",
  query="什么是文本排序模型",
  documents=[
    "文本排序模型广泛用于搜索引擎和推荐系统中，它们根据文本相关性对候选文本进行排序",
    "量子计算是计算科学的一个前沿领域",
    "预训练语言模型的发展给文本排序模型带来了新的进展"
  ],
  top_n=2,
  return_documents=True,
  instruct="Given a web search query, retrieve relevant passages that answer the query."
)

if resp.status_code == HTTPStatus.OK:
  print(resp)
```

#### 7.1.6 多模态 rerank（qwen3-vl-rerank）

**请求格式**：

```json
{
  "model": "qwen3-vl-rerank",
  "input": {
    "query": {
      "text": "什么是文本排序模型"
    },
    "documents": [
      {
        "text": "文本排序模型广泛用于搜索引擎和推荐系统中"
      },
      {
        "image": "https://img.alicdn.com/imgextra/i3/O1CN01rdstgY1uiZWt8gqSL_!!6000000006071-0-tps-1970-356.jpg"
      },
      {
        "video": "https://help-static-aliyun-doc.aliyuncs.com/file-manage-files/zh-CN/20250107/lbcemt/new+video.mp4"
      }
    ]
  },
  "parameters": {
    "return_documents": true,
    "top_n": 2,
    "fps": 1.0
  }
}
```

**特殊参数**：
- `query` 可以是文本或图像
- `documents` 支持文本、图像、视频三种模态
- `fps`：控制视频帧采样比例（仅 qwen3-vl-rerank）

### 7.2 百度千帆 rerank API

#### 7.2.1 API 端点

- **端点**：`POST https://qianfan.baidubce.com/v2/rerank`

#### 7.2.2 请求格式

```json
{
  "model": "bce-reranker-base",
  "query": "上海天气",
  "documents": [
    "上海气候",
    "北京美食"
  ]
}
```

**请求参数**：
- `model`：模型名称
- `query`：查询文本（不超过 1600 字符，token 数超过 400 截断）
- `documents`：待排序的文本列表（不超过 64 个文档，每个文档不超过 4096 字符，token 数超过 1024 截断）
- `top_n`：返回的最相关文本数量（默认为文档数量）

#### 7.2.3 响应格式

```json
{
  "result_type": "rerank_list",
  "results": [
    {
      "index": 0,
      "relevance_score": 0.7161281827133217
    },
    {
      "index": 1,
      "relevance_score": 0.5855924673844218
    }
  ],
  "prompt_tokens": 50,
  "completion_tokens": 0,
  "total_tokens": 50,
  "model": "bce-reranker-base"
}
```

**响应字段**：
- `result_type`：响应类型，固定值 "rerank_list"
- `results`：排序结果数组
- `results[].index`：文档在原始列表中的位置
- `results[].relevance_score`：相关性分数
- `prompt_tokens`：输入 tokens 数
- `completion_tokens`：输出 tokens 数
- `total_tokens`：总 tokens 数
- `model`：使用的模型

#### 7.2.4 支持的模型

百度千帆支持以下 reranker 模型：

- **bce-reranker-base**：基础 reranker 模型
- **自定义模型**：平台训练模型或预置模型

#### 7.2.5 使用示例

```python
import requests
import json

url = "https://qianfan.baidubce.com/v2/rerank"

payload = json.dumps({
    "model": "bce-reranker-base",
    "query": "上海天气",
    "documents": [
        "上海气候",
        "北京美食"
    ]
})

headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer bce-v3/ALTAK-*********/614fb**********'
}

response = requests.request("POST", url, headers=headers, data=payload)
print(response.text)
```

## 8. API 格式对比总结

### 8.1 端点对比

| 平台 | 端点 | 格式 |
|------|------|------|
| Qwen3-Reranker (vLLM) | `/v1/rerank` | Cohere/Jina 兼容 |
| vLLM | `/rerank`, `/v1/rerank`, `/v2/rerank` | Cohere/Jina 兼容 |
| TEI | `/rerank` | 自定义格式 |
| Ollama | `/api/rerank` (开发中) | Cohere/Jina 兼容 |
| Cohere | `/v1/rerank`, `/v2/rerank` | Cohere 格式 |
| Jina | `/v1/rerank` | Jina 格式 |
| 阿里通义 | `/compatible-api/v1/reranks`, `/api/v1/services/rerank/text-rerank/text-rerank` | OpenAI 兼容 + DashScope |
| 百度千帆 | `/v2/rerank` | 自定义格式 |

### 8.2 请求参数对比

| 参数 | Qwen3 | vLLM | TEI | Cohere v1 | Cohere v2 | Jina | 阿里 | 百度 |
|------|-------|------|-----|-----------|-----------|------|------|------|
| `model` | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ | ✓ |
| `query` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `documents` | ✓ | ✓ | `texts` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `top_n` | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ | ✓ |
| `instruct` | ✓ | ✓ | - | - | - | - | ✓ | - |
| `return_documents` | - | ✓ | ✓ | ✓ | - | ✓ | ✓ | - |
| `max_tokens_per_doc` | - | ✓ | - | - | ✓ | - | - | - |

### 8.3 响应字段对比

| 字段 | Qwen3 | vLLM | TEI | Cohere v1 | Cohere v2 | Jina | 阿里 | 百度 |
|------|-------|------|-----|-----------|-----------|------|------|------|
| `results` | ✓ | ✓ | `ranks` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `index` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `relevance_score` | ✓ | ✓ | `score` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `document` | - | - | - | ✓ | - | - | ✓ | - |
| `meta` | ✓ | ✓ | `metadata` | ✓ | ✓ | `usage` | - | - |
| `usage` | - | - | - | - | - | ✓ | ✓ | ✓ |

### 8.4 兼容性矩阵

| 平台 | 兼容 Cohere v1 | 兼容 Cohere v2 | 兼容 Jina | 兼容 OpenAI |
|------|---------------|---------------|-----------|-------------|
| Qwen3-Reranker | ✓ | ✓ | ✓ | - |
| vLLM | ✓ | ✓ | ✓ | - |
| TEI | 部分 | 部分 | 部分 | - |
| Ollama | ✓ (开发中) | ✓ (开发中) | ✓ (开发中) | - |
| Cohere | ✓ | ✓ | 部分 | - |
| Jina | 部分 | ✓ | ✓ | - |
| 阿里通义 | ✓ | ✓ | ✓ | ✓ (OpenAI 兼容端点) |
| 百度千帆 | 部分 | 部分 | 部分 | - |

## 9. 本地部署建议

### 9.1 推荐方案

基于调研结果，推荐以下本地部署方案：

#### 9.1.1 生产环境：vLLM

**优势**：
- 完全兼容 Cohere/Jina 格式
- 高性能推理
- 支持多种 reranker 模型
- 丰富的 API 端点

**部署命令**：

```bash
# 部署 Qwen3-Reranker
vllm serve Qwen/Qwen3-Reranker-8B --host 127.0.0.1 --port 8888 \
  --hf_overrides '{"architectures": ["Qwen3ForSequenceClassification"],"classifier_from_token": ["no", "yes"],"is_original_qwen3_reranker": true}'

# 部署 BGE Reranker
vllm serve BAAI/bge-reranker-base
```

#### 9.1.2 开发环境：Transformers

**优势**：
- 灵活性高
- 易于调试
- 支持自定义模板

**使用示例**：

```python
from sentence_transformers import CrossEncoder

model = CrossEncoder("Qwen/Qwen3-Reranker-0.6B")

scores = model.predict([
    ["What is the capital of China?", "The capital of China is Beijing."],
    ["What is the capital of China?", "Gravity is a force that attracts two bodies towards each other."]
])
```

#### 9.1.3 实验环境：Ollama (社区分支)

**优势**：
- 易于使用
- 支持多种模型格式
- 社区活跃

**部署步骤**：

```bash
# 1. 克隆社区分支
git clone https://github.com/sinjab/ollama.git
cd ollama
git checkout reranking-implementation

# 2. 构建
go build .

# 3. 启动服务
OLLAMA_NEW_ENGINE=1 ./ollama serve

# 4. 创建模型
wget https://huggingface.co/mradermacher/Qwen3-Reranker-0.6B-GGUF/resolve/main/Qwen3-Reranker-0.6B.f16.gguf

cat > Modelfile << 'EOF'
FROM ./Qwen3-Reranker-0.6B.f16.gguf
TEMPLATE "{{ .Query }}{{ .Document }}"
PARAMETER temperature 0.0
EOF

./ollama create qwen_reranker -f Modelfile
```

### 9.2 API 适配建议

#### 9.2.1 统一 API 接口

建议采用 **Cohere/Jina 兼容格式**作为统一接口，原因：

1. 广泛支持：vLLM、Qwen3-Reranker、Jina、阿里通义都支持
2. 标准化：Cohere 和 Jina 是业界标准
3. 易于集成：现有 SDK 和工具支持

#### 9.2.2 接口设计

```json
{
  "model": "reranker-model-name",
  "query": "search query",
  "documents": [
    "document 1",
    "document 2",
    "document 3"
  ],
  "top_n": 5,
  "instruct": "Given a web search query, retrieve relevant passages that answer the query."
}
```

```json
{
  "results": [
    {
      "index": 0,
      "relevance_score": 0.95
    },
    {
      "index": 2,
      "relevance_score": 0.78
    },
    {
      "index": 1,
      "relevance_score": 0.65
    }
  ],
  "meta": {
    "api_version": {
      "version": "2"
    },
    "billed_units": {
      "search_units": 1
    }
  }
}
```

#### 9.2.3 多后端支持

支持多个 reranker 后端：

1. **vLLM**：生产环境主力
2. **TEI**：高性能替代方案
3. **Ollama**：实验和开发环境
4. **云服务**：阿里通义、百度千帆等

## 10. 总结

### 10.1 关键发现

1. **Qwen3-Reranker**：采用 Cohere/Jina 兼容格式，支持 vLLM、Ollama 等多种部署方式
2. **vLLM**：完全兼容 Cohere/Jina 格式，提供三个 rerank 端点，适合生产环境
3. **TEI**：提供简单的 rerank API，但不完全兼容 Cohere/Jina 格式
4. **Ollama**：当前不原生支持 reranker，但社区正在开发中
5. **Cohere**：提供 v1 和 v2 两个版本的 rerank API，业界标准
6. **Jina**：提供多模态 reranker 支持，格式与 Cohere 基本兼容
7. **阿里通义**：提供 OpenAI 兼容和 DashScope 两种格式，支持多模态
8. **百度千帆**：提供自定义格式的 rerank API

### 10.2 最佳实践

1. **生产环境**：使用 vLLM 部署 Qwen3-Reranker 或 BGE Reranker
2. **API 格式**：采用 Cohere/Jina 兼容格式作为统一接口
3. **多模态支持**：考虑使用阿里通义的 qwen3-vl-reranker
4. **开发调试**：使用 Transformers 或 SentenceTransformers
5. **实验探索**：使用 Ollama 社区分支

### 10.3 未来展望

1. **Ollama 原生支持**：预计将在未来版本中添加 rerank 支持
2. **TEI 格式标准化**：可能会改进以兼容 Cohere/Jina 格式
3. **多模态 reranker**：更多模型将支持图像、视频等多模态输入
4. **性能优化**：vLLM 和 TEI 将继续优化推理性能

---

**报告日期**：2026-01-24
**调研范围**：Qwen3-Reranker、vLLM、TEI、Ollama、Cohere、Jina、阿里通义、百度千帆
**文档版本**：v1.0