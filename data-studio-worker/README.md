# Spark execution for Data Studio

A separate full-data batch engine and new standalone cluster configuration are documented in [cluster/README.md](cluster/README.md). The batch CLI preserves all rows, source types and long strings and publishes immutable Parquet output versions. Pipeline persistence/job dispatch/UI integration are not yet connected; current UI actions remain previews.

The Flask Data Studio API calls this worker as a local subprocess. It runs only bounded, allowlisted Spark DataFrame operations over at most 50 rows and 30 columns. Values are sample strings, not type-preserving ETL. Pipelines and their output are not persisted.

## Local setup

From the repository root:

```sh
python3 -m venv data-studio-worker/.venv
data-studio-worker/.venv/bin/python -m pip install -r data-studio-worker/requirements.txt
```

Use Java 17 for the pinned Spark 3.5 runtime ([Apache installation requirements](https://downloads.apache.org/spark/docs/3.5.8/api/python/getting_started/install.html)). The backend automatically discovers `data-studio-worker/.venv/bin/python` and Homebrew Java 17 on macOS. An explicit `STUDIO_SPARK_PREVIEW_PYTHON` overrides the worker interpreter; `STUDIO_SPARK_PREVIEW_JAVA_HOME` overrides Java for the worker without changing voice-auth's Java environment. Restart voice-auth after backend source changes. No `.env` changes are required for the default local worker.

This subprocess setup is for local development. Docker Compose does not yet package the worker or Java.

## Fixed Input example

Open ETL & Pipelines, choose **Contoh Fixed Input 2 × 2**, then **Jalankan preview**. The example connects:

`Fixed Input → Select Columns → Output Dataset`

Input: `Nama, Kota` with rows `Andi, Jakarta` and `Budi, Bandung`. Select Columns keeps `Nama`. The real Spark result is one column (`Nama`) with two rows (`Andi`, `Budi`). Output Dataset receives the preview; it does not save a physical dataset. The preview button becomes available when the graph and configuration are valid. Nodes show successful execution only after the current configuration has returned a Spark result; editing the graph invalidates that result.

## Text transforms

All five Text nodes support Spark preview for Fixed Input and Direct Dataset samples:

| Node | Behavior |
| --- | --- |
| Combine Columns | Concatenates at least two ordered columns with a literal delimiter; optionally removes source columns. NULL contributes an empty field. |
| Replace Text | Replaces all literal occurrences, including literal `$` and backslashes in the replacement. An empty replacement removes the matching text. |
| Split Column | Splits on a literal delimiter into named columns; optionally retains the remainder in the last output and removes the source. Missing pieces are NULL. |
| String Operations | One-based substring; left/right substring; left/right/both space trimming; left/right padding with spaces without truncating longer text. Writes a new column or explicitly replaces the same source name. |
| Text Formatting | Lowercase, uppercase, or uppercase the first character; optionally removes Unicode decimal digits or keeps only those digits. Number cleanup runs before case formatting. |

Text output values are limited to 256 characters, intermediate schemas to 30 columns, and the compiled pipeline to 30 Spark steps. Names must be unique ignoring case. NULL stays NULL except for the documented Combine behavior. Rules and nodes run in graph order. Downstream pickers include created columns and omit removed columns.

Use **Contoh transformasi Text** to run all five Text nodes in one pipeline. The result is `Person, City` with rows `ANDI, j@k@rt@` and `BUDI, b@ndung`.

The worker also supports `select` (including aliases) and equality/null filters. Direct Dataset filters before a transform are applied in SQL Server before sampling. Filters after a transform run on the Spark sample, preserving column names and graph order. Fixed Input filters always run in Spark. Dates and Utility operations are described below; components in the other planned groups remain drafts.

## Dates, numbers and Utility

**Contoh Dates & Utility** connects Calculator, Date Operations, constants, formulas, duplicate/alter columns, JSON extraction, mapping, numeric ordering, limit, metadata selection, SQL, and SQL Script. Its final rows are `PENDING, east, 35.0, 2026, 2026-10-24` and `ACTIVE, west, 25.0, 2026, 2026-10-31`. **Contoh Series & Schema** generates a three-row integer sequence, inspects its schema, and selects `name, type`, yielding `Sequence, bigint`.

| Component | Preview behavior |
| --- | --- |
| Calculator | Addition, subtraction, multiplication, division, power, ceiling, floor; column or constant operands; sequential output columns. |
| Date Operations | Add/subtract days, months or years; difference in days; year, quarter, month, day of year/month/week, ISO week of year. Values use ISO dates. Sunday is day 1. Month/year shifts adjust end-of-month dates. |
| Add Constants | Text, floating/fixed decimal, integer, date, timestamp, boolean, or NULL columns. |
| Add Formula | Arithmetic, comparisons, AND/OR/NOT, IS NULL, literals, quoted column names and allowlisted functions. |
| Alter Columns | Rename, tolerant cast, and drop columns; all resulting names must remain unique. |
| Duplicate Column | Copy a column and retain its Spark type. |
| Get Schema | Replace data with rows containing column name, quoted reference, and actual Spark sample type. Initial source samples are strings; subsequent casts/operations can introduce numeric/date types. |
| JSON Expander | Map bounded JSON paths such as `$.customer.name` and `$.items[0].price` to typed output columns. Generate mappings from a sample JSON object or configure them manually. |
| Limit | Apply offset then limit, both 0–50, to the current sample. |
| Meta Select | Use inline metadata configuration: optional selected column names and a case-sensitive name pattern using `*` and `?`. No second input is required. |
| Order | Multiple keys, ascending/descending, text/numeric/date comparison; NULLs last. |
| Select Columns | Existing ordered column selection and aliases. |
| Series | Replace the current sample with 1–50 rows and one integer sequence column, using Start and Step. |
| SQL / SQL Script | Parse SELECT projections, AS, WHERE, ORDER BY, LIMIT and OFFSET over `input`. Scripts run sequential SELECTs, each reading the preceding result as `input`. No joins, external sources, subqueries, DDL, or arbitrary functions. |
| Value Mapper | Exact mappings to an existing/new column, unmatched original/default values, and optional tolerant cast. |

Formula/SELECT functions: `abs`, `ceil`, `ceiling`, `floor`, `round`, `sqrt`, `power`, `lower`, `upper`, `trim`, `length`, `coalesce`, `concat`, `year`, `month`, `dayofmonth`. Use backticks for names with spaces and doubled backticks for a literal backtick. Example: `SELECT Price * Qty AS Total FROM input WHERE Price > 0 ORDER BY Total DESC LIMIT 10`.

The browser compiles formula/SQL syntax into a bounded expression tree. The worker validates it again and builds Spark DataFrame expressions; it never uses Python eval or executes user SQL. Expressions are limited to 4000 source characters, 256 tree nodes, and depth 20. Numeric operations use doubles. Invalid numeric/date casts, division by zero, NaN and infinity produce NULL. Values are stringified and bounded to 256 characters at the API boundary, while intermediate Spark numeric/date types are preserved for ordering, calculations and schema inspection. Each preview still has at most 50 rows, 30 columns, and 30 compiled steps. Direct filters after any transform apply to the Spark sample in graph order.

## Filter, Combine Data, Aggregate and Pivot

The graph preview endpoint supports 1–4 source nodes (Fixed Input or authorized Direct datasets), up to 30 total nodes and 30 compiled Spark steps, and 1–6 Output Dataset nodes. Connect all nodes to an output; cycles, unused sources, stale ports, and ambiguous join inputs are rejected. Each source and each intermediate output port is limited to 50 rows and 30 columns. Join/unpivot expansion beyond 50 rows is reported as a truncated sample. These are sample results, not full-dataset aggregates.

Use **Contoh Filter & Combine** to preview five results: Full join, Matched, Left only, Right only and Filtered. Use **Contoh Aggregate & Pivot** for Pivot, Unpivot, Dynamic Unpivot and Group & Rank. Choose a result with **Output preview**. Rename an Output Dataset through its configuration. A configuration change invalidates every previously confirmed result.

| Component | Behavior |
| --- | --- |
| Filter Rows | Existing include/exclude/null rules, plus an optional expression predicate supporting numeric comparisons, AND/OR/NOT and IS NULL. A predicate replaces the simple rules. |
| Remove Duplicates | Selected keys or all columns; case-sensitive/insensitive; preserves the first sampled representative; NULL keys compare equal. |
| Split Filter | Up to five ordered predicate branches plus Else. Each row goes to the first matching branch; NULL predicates are false. Branch ports have stable row IDs, so renaming a branch keeps its connections. |
| Append Rows | Left then Right; union of columns or shared columns; missing fields are NULL. Identical types are preserved, different numeric types promote to double, other compatible conflicts become strings; strict conflict mode rejects type differences. |
| Join Data | Inner, Left/Right/Full Outer, Left/Right Anti, and Cross Join. Up to ten AND key pairs; text or numeric matching; NULL matching is explicit and off by default. |
| Split Join | Matched (inner join), Left only (left anti), Right only (right anti) as separate source ports. |
| Group By | Optional grouping keys; sum, avg, min, max, count, count_distinct, first and last. Count(*) includes all rows; count(column) skips NULL. Numeric aggregations ignore invalid numeric values. |
| Rank & Window | Partition and text/numeric/date ordering; row_number, rank, dense_rank, percent_rank, cume_dist, ntile, lag, lead, running_sum/avg/count/min/max. Running frames include preceding rows through the current row. |
| Pivot | Explicit label-to-output mappings with aggregate functions and grouping keys. Repeated labels are aggregated; absent sums remain NULL and absent counts are zero. |
| Unpivot | Selected columns become label/value rows; remaining columns are keys. Output values are strings; NULL values may be included or excluded. |
| Dynamic Unpivot | Keep selected identity columns and unpivot every other incoming column using its name as the label. |

Combine nodes have explicit **Left** and **Right** target ports. Each needs exactly one connection. Split nodes expose labeled source ports; connect the relevant source port to a transformation or Output Dataset. Multiple outputs and shared upstream branches are executed within one Spark process. Right-hand join columns have a configurable prefix (default `right_`); anti outputs retain the original columns of their own side. Result names must remain unique, ignoring case.

The backend validates graph structure, session, and CSRF before source access, authorizes every referenced dataset before opening any source connection, and sends only bounded samples (never database credentials) to the worker. The worker independently validates references, topology, ports, operation fields and schema bounds. Graph Direct Dataset filters operate after the first-page sample; existing linear Direct flows retain their pre-transform SQL filter behavior.

## Scripting: Python and R

Both scripting nodes execute the actual language runtime in disposable Docker containers and return a bounded table to Spark. Use **Contoh Python & R**: Python/pandas computes totals and filters rows; R adds a category. Choose **Hasil Python** or **Hasil Python & R** in Output preview. The second result is `Andi, 20.0, Standard` and `Budi, 30.0, High`. **Log scripting** shows bounded print/cat output for each node.

Build the local scripting image once, with Docker running:

```sh
docker build -t coreanalytics-studio-scripts:local data-studio-worker/script-runtime
```

The image contains Python 3.13, pandas 2.2.3, numpy 2.2.6, base R, and jsonlite. The Dockerfile pins the Python base manifest digest. No Python/R packages are installed into voice-auth or the Spark interpreter. Runtime status is checked by the authenticated `/api/studio/datasets/script-runtime` endpoint; **Periksa runtime** refreshes the editor's status. The run button remains disabled when a scripting runtime is unavailable.

Python receives `input` and `df` as independent pandas DataFrames, with `pd` and `np` available. R receives `input` and `df` as data.frames. Input values are strings/NULL (R uses NA); convert numeric/date values explicitly. Both require an explicit `output` DataFrame/data.frame, with exactly the column names and order configured under **Kolom hasil**. Configure output Spark types there; tolerant casts follow the existing Utility semantics. Results may contain zero rows, but must retain 1–30 columns. Returning lists, missing `output`, unexpected columns, more than 50 rows, nested cells, or values over 256 characters fails with a diagnostic rather than silently changing the schema. Script source is limited to 8000 characters and at most four scripting nodes per preview.

```python
output = df.copy()
output["Total"] = pd.to_numeric(df["Harga"], errors="coerce") * pd.to_numeric(df["Jumlah"], errors="coerce")
output = output[["Nama", "Total"]]
print(f"Python: {len(output)} rows")
```

```r
output <- df
output$Total <- as.numeric(output$Total)
output$Kategori <- ifelse(output$Total >= 25, "High", "Standard")
cat(sprintf("R: %d rows\n", nrow(output)))
```

Each script runs as UID/GID 65532, with no network, no host mounts or Docker socket, a read-only root filesystem, dropped capabilities, no privilege escalation, 384 MiB memory, one CPU, a 64-process limit, and small disposable tmpfs directories. Host proxy environment defaults are explicitly cleared. The child process has an eight-second wall timeout, the worker enforces a 15-second container exchange limit and bounded output, and the backend cleans only containers carrying its unique preview-request label even after a worker failure. Input and output travel over stdin/stdout; database credentials and backend environment variables never enter the scripting container. Runtime syntax/schema errors are returned as bounded details; normal console output is capped at 8192 characters per node.

The trusted local Spark worker needs permission to use the host Docker daemon. `STUDIO_SCRIPT_DOCKER` can configure an absolute CLI path; `STUDIO_SCRIPT_IMAGE` can select an administrator-built compatible image with the runtime label. Both are server environment settings, never request fields. Images must be built/pulled by the administrator; preview uses `--pull=never`. Package installation and external network calls from user scripts are unavailable. Docker Compose/production voice-auth packaging is still separate from this local development runtime.

## Verification

Frontend compilation and graph regressions:

```sh
cd voice-dashboard
node --test scripts/test-*-preview.mjs
npm run build
```

Worker tests, from `data-studio-worker` (set `JAVA_HOME` to Java 17 when needed):

```sh
SPARK_LOCAL_IP=127.0.0.1 PYSPARK_PYTHON="$PWD/.venv/bin/python" .venv/bin/python -B -m unittest discover -s tests
```

The API integration test invokes the real subprocess and Spark while replacing only authentication with a synthetic test principal. It performs no database access. From the repository root, using the backend Python environment:

```sh
STUDIO_TEST_REAL_SPARK=1 STUDIO_TEST_REAL_SCRIPT=1 .venv/bin/python -B -m unittest discover -s voice-auth-backend/tests
```

`run_preview.py` also accepts a bounded JSON request through stdin for diagnostics.

Set `STUDIO_TEST_REAL_SCRIPT=1` when running worker tests to include real container, isolation, timeout, and Python→R→Spark regressions. Without the flag these Docker-specific tests are skipped.

## Data Science preview

The seven tiles follow the configuration/output contracts in [Domo's Data Science documentation](https://www.domo.com/docs/s/article/360045259294), using local implementations. Exact results and proprietary model searches need not match Domo. Install this worker's pinned `requirements.txt` in its own virtual environment.

- Classification: Gaussian Naive Bayes or seeded Random Forest. Prediction: Linear Regression or seeded Random Forest. Connect required **Training** and optional **Predict** ports; without Predict, training rows are predicted. Numeric/categorical features are separate, target leakage is rejected, encodings are learned from training only, and unseen categories are ignored. Results preserve prediction-input columns and append a prediction. Models are retrained for each preview.
- Clustering: seeded k-means (Euclidean) or iterative k-medians (Manhattan), 1–20 clusters, raw feature scale, one-based IDs. Cluster count must not exceed distinct feature rows.
- Outlier Detection: sample standard deviation, or the median-based MAD described under Domo's “Mean Absolute Deviation” option, without consistency scaling. Flag when absolute deviation exceeds cutoff × deviation. With zero deviation, non-center values are flagged; constant columns have no flags. Output is `true`/`false`.
- Multivariate Outliers: squared Mahalanobis distance using sample covariance against a chi-square quantile with feature-count degrees of freedom. Output is `0`/`1`. Reject singular covariance and insufficient observations.
- Forecasting: minimum-AIC selection across converged ARIMA `(0,1,0)`, `(1,0,0)`, `(0,1,1)`, `(1,1,0)`, `(1,1,1)`, at most 35 optimizer iterations. Frequency > 1 adds seasonal `(1,0,0,frequency)`. This bounded search differs from Domo's internal auto-ARIMA. Require at least 8 unique ISO dates and two seasonal periods. Sort dates; use mean historical interval for future dates. Retain requested history and append 1–25 future rows with prediction/confidence bounds. Historical prediction cells and future observed-value cells are NULL. All sampled history trains the model, independently of displayed history. History + forecast must fit 50 rows; forecasts are never silently dropped.
- AutoML Inference: select a previously trained local model. Expand its training section to sample the connected upstream graph and choose target/features. Classification compares Naive Bayes and Random Forest with stratified CV accuracy; regression compares Linear Regression and Random Forest with CV RMSE. Preprocessing is fitted separately inside each fold. Refit the winner on all samples, then reuse for inference on any input with the same features. Training requires 6–50 rows; classification needs two classes and two samples per class.

AutoML models live only in backend memory, expire after one hour, belong to the authenticated principal, and disappear on backend restart. Limits: 10 models per principal, 100 total. No production job, persistent model registry, model export/import or Domo connection is provided. Public endpoints never return artifacts and reject uploaded artifacts on **all** preview paths before accessing datasets or launching a worker. Only the trusted trainer's server-owned artifacts can be injected for inference. The worker's internal trusted protocol is not an HTTP API: never expose it or accept pickle/joblib uploads.

Scientific operations run on bounded samples in the trusted worker. User Python/R code retains the existing Docker isolation without host access. NULL/invalid/nonfinite numeric data produce explicit errors, without implicit imputation. Existing bounds remain: 50 rows per source/node, 30 columns, 30 graph nodes. Six science examples and an AutoML training starter are available on the pipeline introduction screen. Output datasets and pipelines are still preview-only.

## Performance tiles

[Select and Store Columns / Restore Columns](https://www.domo.com/docs/s/article/4405156517527) now work in graph previews. Select the columns needed by Python/R and name a new restore-key column. The worker keeps omitted columns and their Spark types in request-local memory, forwards only selected columns plus opaque per-row Text tokens, and restores omitted values after the script using those tokens. Include the key as `Text` in the script's declared output schema and preserve its name/value. Restore selects an upstream store node, removes that store's key, preserves current columns, then appends stored columns in their original order. It never overwrites columns with conflicting names.

Filtering and reordering rows preserve the association. Duplicating an existing row/key duplicates its saved values. Unknown/NULL/missing/non-Text keys, unavailable stores, name collisions and outputs exceeding 30 columns are rejected. Do not alter valid keys or assign another row's key: the key defines row identity. New rows need a valid existing key to receive saved values. Empty results are supported. Nested stores and multiple downstream restore branches are independent; a store in an unrelated sibling branch cannot be restored. References and configuration shape are checked before any dataset is read.

Stores are rebuilt for every preview request, never persisted, and never returned in the response. Existing 50-row/source/node and 30-column limits remain. The key occupies one column while passed through a script. These tiles reduce script input width; this bounded preview does not claim full-dataset performance benchmarks or dataset persistence. Choose **Contoh Performance Python** or **Contoh Performance R** on the pipeline introduction page: the script processes only Harga/Jumlah/RestoreKey, filters and sorts, and restores Nama/Kota. Expected result: Budi/Bandung with Total 30, followed by Andi/Jakarta with Total 20.

## AI Services

The four AI Services tiles now execute real local models through Spark. Their configuration follows the relevant patterns in [Domo AI Services](https://www.domo.com/docs/s/article/000005741); these are local implementations, not connections to Domo's managed models, cloud batches, compute tiers or Document Collections.

- **AI Classification:** choose a local language model, text source, instructions, and 2–10 labels/descriptions. Single Label appends one selected label; Multi Label appends an independent Boolean column per label.
- **Sentiment Analysis:** Overall appends one sentiment, while Targeted appends a sentiment for each of 1–5 named topics. Allowed values are Positive, Negative, Neutral, Not Applicable.
- **Text Generation:** use a prompt with `{{Column Name}}` placeholders and optional instructions/temperature (0–2). Only referenced input values enter the prompt. Choose one text output or 1–5 structured columns with Text, Integer, Floating Decimal or Boolean types and descriptions. Names, types, label membership, finite numbers, signed 64-bit integers, required fields and text lengths are independently validated after model generation. No model output is executed as code.
- **AI Model Inference:** reuse the server-owned AutoML preview model registry introduced in Data Science. Select or train a local classification/regression model, verify its task and feature names, and choose whether to include input columns. Output-only mode returns the prediction column. This supports preview locally even though Domo's documented AI Model Inference tile has different deployment/preview restrictions. It does not import arbitrary model files or connect to Domo AI Library.

Start an existing local Ollama installation with `OLLAMA_HOST=127.0.0.1:11434 ollama serve`. `GET /api/studio/datasets/ai-runtime` checks installed local GGUF models without downloading or generating anything. The default is `mistral:latest` when installed. Only downloaded, non-cloud GGUF model entries are listed/accepted. `STUDIO_AI_OLLAMA_URL` may configure an HTTP **literal loopback** endpoint with explicit port; URLs with credentials, paths, query/fragment, non-loopback hosts, proxies and redirects are rejected. This setting belongs to the server environment, never the browser request. No API keys are required or copied to the frontend. There is no external/cloud fallback, model pull or automatic package installation.

Generative previews require at most **5 input rows per tile**, at most **4 generative tiles**, and **10 total model calls** per request, with an 80-second inference budget and at most 45 seconds per call. The backend allows 120 seconds for requests containing generative tiles (other previews retain 60 seconds). Add a Limit tile before AI for larger samples; exceeding a bound is an explicit error, not silent data truncation. BATCH/NON_BATCH preference is stored, but these previews are below 100 rows and always execute NON_BATCH. NULL classification/sentiment inputs propagate NULL without generating a result. Responses are schema-constrained JSON and are rejected on invalid schema, incomplete output or text exceeding the standard **256-character cell limit**, without synthetic fallback values. Generative quality depends on the selected model; review results. Thinking models may exhaust the output limit; choose an instruction model such as Mistral for these short previews.

AI Model Inference uses the existing 50-row limit and owner-scoped models that expire after one hour/restart. Serialized artifacts remain server-owned and are rejected on every public preview route. Uploaded CSV/custom artifact deployment and persistent model management are outside this preview implementation. Runtime failures keep palette/readiness states honest; AI errors clear stale results. The preview response includes `ai_usage` with model, provider, row count, actual model-call count and effective execution mode, without prompts, source text or model artifacts. UI examples are available for all four tiles; the inference example includes a 16-row training starter.

Set `STUDIO_TEST_REAL_AI=1` to include local Ollama tests. Combined with `STUDIO_TEST_REAL_SPARK=1`, API tests run real LLM → Spark and trusted model → Spark paths on synthetic data, replacing only authentication and database access. Without these flags, deterministic schema/validation/provider-failure tests still run and real integration cases are explicitly skipped.

Pembacaan hasil persisten pada katalog/Data Explorer: lihat [Parquet reader](reader/README.md). Reader berjalan terpisah dengan shared storage read-only dan scope pemilik melalui metadata API.
