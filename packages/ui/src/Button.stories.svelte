<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, fn } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';

  import Button from './Button.svelte';

  /**
   * A button: `primary` for the one main action of a view, `secondary` for the rest, `danger` for what cannot be
   * undone. Its words say what it does, starting with the verb.
   */
  const { Story } = defineMeta({
    title: 'Actions/Button',
    component: Button,
    tags: ['autodocs'],
    args: { onclick: fn() },
    argTypes: { variant: { control: 'radio', options: ['primary', 'secondary', 'danger'] } },
  });
</script>

<Story
  name="Primary"
  args={{ variant: 'primary', name: 'offer', value: 'week' }}
  play={async ({ canvas, userEvent, args }) => {
    const button = canvas.getByRole('button', { name: 'Claim 7 days free' });
    // A plain button unless it is told it submits, and what it posts, passed on.
    await expect(button).toHaveAttribute('type', 'button');
    await expect(button).toHaveAttribute('name', 'offer');
    await expect(button).toHaveAttribute('value', 'week');
    await userEvent.click(button);
    await expect(args.onclick).toHaveBeenCalledTimes(1);
  }}>
  {#snippet template(args)}<Button {...withoutChildren(args)}>Claim 7 days free</Button>{/snippet}
</Story>

<Story name="Secondary" args={{ variant: 'secondary', type: 'submit' }}>
  {#snippet template(args)}<Button {...withoutChildren(args)}>Save nickname</Button>{/snippet}
</Story>

<Story name="Danger" args={{ variant: 'danger' }}>
  {#snippet template(args)}<Button {...withoutChildren(args)}>Delete profile</Button>{/snippet}
</Story>

<Story
  name="Disabled"
  args={{ disabled: true }}
  play={async ({ canvas, userEvent, args }) => {
    const button = canvas.getByRole('button', { name: 'Buy' });
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onclick).not.toHaveBeenCalled();
  }}>
  {#snippet template(args)}<Button {...withoutChildren(args)}>Buy</Button>{/snippet}
</Story>
