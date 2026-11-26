<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';

  import Field from './Field.svelte';

  /**
   * A field: its label, the page's own control, a hint, and the problem with what was entered, each tied to the
   * control for a screen reader. The page spreads what the field gives onto its control.
   */
  const { Story } = defineMeta({
    title: 'Forms/Field',
    component: Field,
    tags: ['autodocs'],
    args: { id: 'nickname', label: 'Nickname' },
  });
</script>

<Story
  name="With a hint"
  args={{ hint: 'What other users see you as, instead of your user id.' }}
  play={async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Nickname' });
    await expect(input).toHaveAccessibleDescription('What other users see you as, instead of your user id.');
    await expect(input).toHaveAttribute('aria-invalid', 'false');
  }}>
  {#snippet template(args)}
    <Field {...withoutChildren(args)}>
      {#snippet children(field)}<input {...field} name="nickname" maxlength="64" />{/snippet}
    </Field>
  {/snippet}
</Story>

<Story
  name="With a problem"
  args={{
    hint: 'What other users see you as, instead of your user id.',
    problem: 'A nickname has only letters, digits, spaces, hyphens and underscores.',
  }}
  play={async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: 'Nickname' });
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', 'nickname-hint nickname-problem');
    await expect(input).toHaveAccessibleDescription(/only letters, digits/);
  }}>
  {#snippet template(args)}
    <Field {...withoutChildren(args)}>
      {#snippet children(field)}<input {...field} name="nickname" value="amber fox!" />{/snippet}
    </Field>
  {/snippet}
</Story>

<Story
  name="A select, with nothing more"
  args={{ id: 'reason', label: 'Why are you cancelling?' }}
  play={async ({ canvas }) => {
    const select = canvas.getByRole('combobox', { name: 'Why are you cancelling?' });
    await expect(select).not.toHaveAttribute('aria-describedby');
  }}>
  {#snippet template(args)}
    <Field {...withoutChildren(args)}>
      {#snippet children(field)}
        <select {...field} name="reason">
          <option>No longer required</option>
          <option>Too expensive</option>
        </select>
      {/snippet}
    </Field>
  {/snippet}
</Story>
