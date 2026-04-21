# План миграции SaaS-блоков в Local UI

## Цель

Перенести в Step 7 (Reports) локального оркестратора блоки анализа в стиле SaaS, при этом сохранить текущий legacy-рендер отчета как безопасный fallback.

Критерии успеха:
- Step 7 показывает структурированные блоки анализа с понятными заголовками и компактной визуализацией.
- Отсутствующие данные не ломают страницу - неподдерживаемые блоки пропускаются с понятной причиной.
- Legacy-рендер остается доступным до подтвержденного паритета.

## Область работ

Входит в работу:
- Поверхность отчета Step 7 в `engine/packages/cli/web`.
- Блочный рендер секций анализа.
- Адаптер из локального report payload в типизированный блоковый input.

Не входит в работу (для этой ветки миграции):
- Переписывание UI шагов 1-6.
- Изменение логики генерации отчетов в engine-core.
- Полный SSR slot паритет с Next.js SaaS реализацией.

## Текущий baseline

- Список отчетов и выбор отчета в Step 7 находятся в `web/src/shell/ShellReportsStep.tsx`.
- Полные детали отчета сейчас рендерит legacy-монолит `web/src/legacy/report-view.tsx`.
- Backend routes обслуживаются из `packages/cli/src/commands/ui.ts`:
  - `GET /api/reports`
  - `GET /api/reports/:id`
- Shape детального ответа локального отчета - `LocalReport` с `report: unknown` и `rawPayload: unknown`.

## Целевая архитектура

### `ReportSurface` (новый компонент)

Единая входная точка для Step 7:
- Input: `reportId`.
- Ответственности:
  - загрузить данные один раз,
  - смэппить payload в типизированную блоковую модель,
  - отрендерить современный набор блоков,
  - переключиться на legacy-рендер при необходимости.

Планируемый файл:
- `web/src/shell/report/ReportSurface.tsx`

### Data flow

1. `ShellReportsStep` выбирает `reportId`.
2. `ReportSurface` запрашивает `/api/reports/:id`.
3. Mapper преобразует `LocalReport.report` -> `TestResultDataLite`.
4. Матрица доступности блоков решает, какие блоки рендерить.
5. Если критичный мэппинг не удался, показывается legacy-рендер с предупреждением.

## Предлагаемые интерфейсы

### `ReportSurfaceProps`

```ts
export type ReportSurfaceProps = {
  reportId: string;
  mode?: "auto" | "blocks" | "legacy";
  showDebugMeta?: boolean;
};
```

Правила:
- `auto` (по умолчанию): сначала пробуем blocks, затем fallback на legacy.
- `blocks`: рендерим только блоки, при нехватке данных показываем нефатальные placeholders.
- `legacy`: принудительно старый рендер.

### `TestResultDataLite`

Минимальный контракт, достаточный для первых волн миграции:

```ts
export type TestResultDataLite = {
  strategy?: {
    name?: string;
    symbol?: string;
    timeframe?: string;
    exchange?: string;
  };
  decisionSummary?: {
    verdict?: string;
    confidence?: number;
    riskLevel?: string;
    deploymentReadiness?: boolean;
  };
  verdictPayload?: Record<string, unknown> | null;
  robustnessScore?: {
    overall?: number;
    components?: {
      parameterStability?: number;
      timeRobustness?: number;
      marketRegime?: number;
      monteCarloStability?: number;
      sensitivity?: number;
    };
    modules?: Record<string, number>;
  } | null;
  dataQualityGuardResult?: Record<string, unknown> | null;
  benchmarkComparison?: Record<string, unknown> | null;
  proBenchmarkMetrics?: Record<string, unknown> | null;
  walkForwardAnalysis?: Record<string, unknown> | null;
  parameterSensitivity?: Record<string, unknown> | null;
  turnoverAndCostDrag?: Record<string, unknown> | null;
  riskAnalysis?: Record<string, unknown> | null;
  strategyActionPlan?: Record<string, unknown> | null;
};
```

## Матрица блоков (обязательные и опциональные поля)

| Блок | Обязательные поля | Опциональные поля | Поведение fallback |
| - | - | - | - |
| Final Verdict | `verdictPayload` OR `decisionSummary.verdict` | confidence, riskLevel | компактная verdict-карточка из `decisionSummary` |
| Robustness Score | `robustnessScore.overall` | components, modules | показываем только overall |
| Data Quality Guard | `dataQualityGuardResult` | module breakdown | badge + краткое сообщение |
| Benchmark Metrics | `proBenchmarkMetrics` OR `benchmarkComparison` | interpretive text | показываем доступный вариант |
| Walk-Forward | `walkForwardAnalysis` | professional/heavy части | скрываем недоступные subsections |
| Parameter Sensitivity | `parameterSensitivity` | diagnostics | только summary списка параметров |
| Turnover and Cost Drag | `turnoverAndCostDrag` | дополнительные подсказки | только key metrics |
| Risk Metrics | `riskAnalysis` | qualitative notes | только scalar metrics |
| Strategy Action Plan | `strategyActionPlan` OR контекст из decisionSummary | детальные действия | базовый план выводим из verdict |

## Правила доступности

Каждый блок получает machine-readable статус:

```ts
type BlockStatus =
  | { state: "ready" }
  | { state: "partial"; reason: string }
  | { state: "missing"; reason: string };
```

Правила:
- `ready`: рендерим полный блок.
- `partial`: рендерим компактный блок с предупреждением о частичных данных.
- `missing`: скрываем блок в обычном режиме, показываем placeholder в debug режиме.

## План миграции по PR

## PR1 - Основание и безопасная обертка

Deliverables:
- Добавить `ReportSurface` с переключением режима и fetch lifecycle.
- Добавить mapper `mapLocalReportToLite`.
- Сохранить legacy как output по умолчанию в `auto` режиме.
- Добавить telemetry logs по статусу мэппинга в dev console.

Планируемые файлы:
- `web/src/shell/report/ReportSurface.tsx`
- `web/src/shell/report/useReportData.ts`
- `web/src/shell/report/mapLocalReportToLite.ts`
- `web/src/shell/ShellReportsStep.tsx` (переключение на `ReportSurface`)

Acceptance:
- Нет регрессий в Step 7.
- Legacy output не меняется при провале мэппинга.

## PR2 - Первый набор блоков (максимальная ценность, низкий риск)

Deliverables:
- Реализовать рендер блоков:
  - Final Verdict
  - Robustness Score
  - Data Quality Guard
- Добавить section container и spacing, согласованные с shell design.
- Показать legacy-рендер ниже блоков в collapsible секции "Full legacy report".

Планируемые файлы:
- `web/src/shell/report/blocks/FinalVerdictBlock.tsx`
- `web/src/shell/report/blocks/RobustnessScoreBlock.tsx`
- `web/src/shell/report/blocks/DataQualityGuardBlock.tsx`
- `web/src/shell/report/ReportBlocksView.tsx`

Acceptance:
- Выбранные отчеты (включая demo fixtures) корректно показывают эти блоки.
- Существующие deep links `#report=<id>` продолжают работать.

## PR3 - Расширенные блоки анализа + путь к deprecation

Deliverables:
- Добавить оставшиеся блоки:
  - Benchmark
  - Walk-Forward
  - Parameter Sensitivity
  - Turnover and Cost Drag
  - Risk
  - Strategy Action Plan
- Добавить diagnostics-панель доступности блоков (опциональный debug toggle).
- Пометить legacy-рендер как fallback-only в code comments.

Acceptance:
- Покрытие блоков достигает паритета для типовых report payloads.
- Legacy view остается доступным для edge payloads.

## Риски и меры снижения

- Риск: расхождение payload shape между локальными отчетами и ожиданиями SaaS.
  - Мера: mapper со строгими guards + partial states.
- Риск: большой payload компонентов замедляет Step 7.
  - Мера: memoized mapping и lazy mount для тяжелых блоков.
- Риск: визуальная несогласованность с shell design.
  - Мера: использовать shell Tailwind tokens и не использовать legacy scoped styles для новых блоков.
- Риск: скрытые регрессии на редких shape отчетов.
  - Мера: оставить legacy fallback и добавить проверки на fixtures.

## Стратегия тестирования

Функциональные проверки:
- Открыть Step 7 и быстро переключать несколько отчетов.
- Проверить все режимы: `auto`, `blocks`, `legacy`.
- Проверить deep link поведение с `#report=<id>`.

Проверки shape данных:
- Использовать существующие fixture отчеты:
  - `packages/cli/fixtures/saas-mock-report.json`
  - `packages/cli/fixtures/saas-mock-paper-tiger-report.json`
- Добавить один намеренно sparse fixture с отсутствующими полями.

Regression checks:
- `npm run build:web`
- Manual smoke по навигации Steps 1-7.

## Decision gates rollout

Gate 1 (после PR1):
- Нет UX регрессий, fallback подтвержден.

Gate 2 (после PR2):
- Первый набор блоков корректен на всех demo fixtures.

Gate 3 (после PR3):
- Расширенные блоки стабильны; legacy можно визуально понизить в приоритете, но пока не удалять.

## Опциональный follow-up

После стабилизации PR3 оценить вынос shared block primitives из SaaS в переиспользуемые package(s), но только после стабилизации локального контракта и модели доступности.
