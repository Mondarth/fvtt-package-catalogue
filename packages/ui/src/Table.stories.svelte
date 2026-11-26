<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';

  import Badge from './Badge.svelte';
  import Table from './Table.svelte';

  /**
   * A table of data: the page writes its rows and columns, this sets them out. A wide one scrolls sideways in its own
   * box, which a keyboard can reach.
   */
  const { Story } = defineMeta({
    title: 'Data/Table',
    component: Table,
    tags: ['autodocs'],
    args: { caption: 'Your purchases' },
  });
</script>

<Story
  name="Purchases"
  play={async ({ canvas }) => {
    const table = canvas.getByRole('table', { name: 'Your purchases' });
    await expect(canvas.getByRole('region', { name: 'Your purchases' })).toHaveAttribute('tabindex', '0');
    await expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
    await expect(canvas.getByText('Your purchases', { selector: 'caption' })).not.toHaveClass('mdr-visually-hidden');
  }}>
  {#snippet template(args)}
    <Table {...withoutChildren(args)}>
      <thead>
        <tr><th scope="col">Bought</th><th scope="col">Time</th><th scope="col">Paid</th><th scope="col">State</th></tr>
      </thead>
      <tbody>
        <tr><td>20 Nov 2026</td><td>1 month</td><td>£3.60</td><td><Badge tone="success">Paid</Badge></td></tr>
        <tr><td>25 Nov 2026</td><td>7 days</td><td>Free</td><td><Badge tone="accent">Introductory</Badge></td></tr>
      </tbody>
    </Table>
  {/snippet}
</Story>

<Story
  name="Caption for screen readers alone"
  args={{ caption: 'Offers', hideCaption: true }}
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('table', { name: 'Offers' })).toBeInTheDocument();
    await expect(canvas.getByText('Offers', { selector: 'caption' })).toHaveClass('mdr-visually-hidden');
  }}>
  {#snippet template(args)}
    <h2>Offers</h2>
    <Table {...withoutChildren(args)}>
      <thead><tr><th scope="col">Name</th><th scope="col">Period</th></tr></thead>
      <tbody><tr><td>Month</td><td>1 month</td></tr></tbody>
    </Table>
  {/snippet}
</Story>
