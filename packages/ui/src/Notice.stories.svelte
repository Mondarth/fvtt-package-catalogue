<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Notice from './Notice.svelte';

  /**
   * A note set apart from the text around it, announced as a note, not an alert. Plain, it is in the accent, as at the
   * top of a page translated by machine. It may say what it is for, in that purpose's status colour (`type`: note, tip,
   * important, warning or caution), and with an icon for it (`icon`). mondarth.com's callouts look the same.
   */
  const { Story } = defineMeta({
    title: 'Feedback/Notice',
    component: Notice,
    tags: ['autodocs'],
    argTypes: {
      type: { control: 'select', options: [undefined, 'note', 'tip', 'important', 'warning', 'caution'] },
      icon: { control: 'boolean' },
    },
  });

  const TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
  const WORDS = {
    note: 'Note: EMMA asks Foundry once a week which premium packages you own.',
    tip: 'Tip: shift-click a tag to show it alone.',
    important: 'Important: back up your worlds before running a plan.',
    warning: 'Warning: this is an alpha build.',
    caution: 'Caution: uninstalling a game system removes it from every world.',
  };
</script>

<Story
  name="Machine translation"
  play={async ({ canvas }) => {
    const note = canvas.getByRole('note');
    await expect(note).toHaveTextContent('This page was translated by machine.');
    // A note, not an alert: it takes nothing from the reader; plain, it has no icon.
    await expect(canvas.queryByRole('alert')).toBeNull();
    await expect(note.querySelector('svg')).toBeNull();
  }}>
  {#snippet template()}
    <Notice>This page was translated by machine.</Notice>
  {/snippet}
</Story>

<Story
  name="Each purpose"
  play={async ({ canvas }) => {
    const notes = canvas.getAllByRole('note');
    await expect(notes).toHaveLength(TYPES.length);
    // Each in its own colour: no two borders alike.
    const borders = new Set(notes.map(note => getComputedStyle(note).borderInlineStartColor));
    await expect(borders.size).toBe(TYPES.length);
  }}>
  {#snippet template()}
    {#each TYPES as type (type)}
      <Notice {type}>{WORDS[type]}</Notice>
    {/each}
  {/snippet}
</Story>

<Story
  name="Each purpose, with its icon"
  play={async ({ canvas }) => {
    const notes = canvas.getAllByRole('note');
    for (const [index, type] of TYPES.entries()) {
      const icon = notes[index]?.querySelector('svg');
      await expect(icon).toHaveAttribute('data-icon', type);
      // The icon says nothing the words do not.
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  }}>
  {#snippet template()}
    {#each TYPES as type (type)}
      <Notice {type} icon>{WORDS[type]}</Notice>
    {/each}
  {/snippet}
</Story>

<Story
  name="Plain, with an icon"
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('note').querySelector('svg')).toHaveAttribute('data-icon', 'note');
  }}>
  {#snippet template()}
    <Notice icon>This page was translated by machine.</Notice>
  {/snippet}
</Story>

<Story name="Longer, with paragraphs and a list">
  {#snippet template()}
    <Notice type="tip" icon>
      <p>Before running a plan:</p>
      <ul>
        <li>back up your worlds;</li>
        <li>check that each world's game system is in the plan.</li>
      </ul>
    </Notice>
  {/snippet}
</Story>
