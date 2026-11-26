<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Badge from './Badge.svelte';

  /** A word or two of state beside what it is about. Its tone is a theme colour; its words say what it means. */
  const { Story } = defineMeta({
    title: 'Data/Badge',
    component: Badge,
    tags: ['autodocs'],
    argTypes: {
      tone: { control: 'select', options: ['neutral', 'accent', 'success', 'warning', 'danger', 'info'] },
    },
  });
</script>

<Story
  name="Every tone"
  play={async ({ canvas }) => {
    for (const word of ['Retired', 'Introductory', 'Paid', 'Refund pending', 'Disputed', 'Sandbox'])
      await expect(canvas.getByText(word)).toBeVisible();
  }}>
  {#snippet template()}
    <p style="display:flex;flex-wrap:wrap;gap:var(--mdr-space-2)">
      <Badge>Retired</Badge>
      <Badge tone="accent">Introductory</Badge>
      <Badge tone="success">Paid</Badge>
      <Badge tone="warning">Refund pending</Badge>
      <Badge tone="danger">Disputed</Badge>
      <Badge tone="info">Sandbox</Badge>
    </p>
  {/snippet}
</Story>
