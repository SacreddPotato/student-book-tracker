<script lang="ts">
  import { getTranslation, language, type TranslationKey } from "$lib/i18n";

  export type LogItemView = {
    id: string;
    bookName: string;
    quantityDelta: string;
    quantityAfter: string;
  };

  export type LogEntryView = {
    id: string;
    title: string;
    typeLabel: string;
    occurredAt: string;
    items: LogItemView[];
    canReverse: boolean;
    isReversed: boolean;
  };

  type Props = {
    entry: LogEntryView;
    onReverse: (entry: LogEntryView) => void;
  };

  const { entry, onReverse }: Props = $props();

  function t(key: TranslationKey): string {
    return getTranslation($language, key);
  }
</script>

<article class="log-group" aria-label={entry.title}>
  <div class="log-heading">
    <div>
      <p>{entry.typeLabel}</p>
      <h3>{entry.title}</h3>
      <span>{entry.occurredAt}</span>
    </div>

    {#if entry.canReverse}
      <button
        type="button"
        aria-label={`${t("buttons.reverse")} ${entry.title}`}
        onclick={() => onReverse(entry)}
      >
        {t("buttons.reverse")}
      </button>
    {:else if entry.isReversed}
      <button type="button" disabled>{t("logs.alreadyReversed")}</button>
    {/if}
  </div>

  <ul class="item-list">
    {#each entry.items as item}
      <li>
        <strong>{item.bookName}</strong>
        <span>{item.quantityDelta}</span>
        <span>{item.quantityAfter}</span>
      </li>
    {/each}
  </ul>
</article>

<style>
  .log-group {
    display: grid;
    gap: 12px;
    border-bottom: 1px solid #e4ebe9;
    padding: 16px 0;
  }

  .log-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
  }

  p,
  h3 {
    margin: 0;
  }

  p {
    color: #607077;
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  h3 {
    margin-top: 3px;
    color: #17212f;
    font-size: 1rem;
    letter-spacing: 0;
  }

  .log-heading span {
    display: inline-block;
    margin-top: 4px;
    color: #607077;
    font-size: 0.88rem;
    font-weight: 700;
  }

  .item-list {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item-list li {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) 72px 110px;
    gap: 10px;
    align-items: center;
    border: 1px solid #e4ebe9;
    border-radius: 6px;
    padding: 9px 10px;
    color: #24313c;
    background: #f8faf9;
  }

  .item-list span {
    color: #42535a;
    font-weight: 700;
    text-align: end;
  }

  button {
    min-height: 36px;
    border: 1px solid #8a3d10;
    border-radius: 6px;
    padding: 7px 12px;
    color: #ffffff;
    background: #8a3d10;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    white-space: nowrap;
  }

  button:disabled {
    color: #607077;
    background: #eef4f2;
    border-color: #d5dfdc;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .log-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .item-list li {
      grid-template-columns: 1fr;
    }

    .item-list span {
      text-align: start;
    }
  }
</style>
