<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import { withoutChildren } from '../.storybook/args';

  import Checkbox from './Checkbox.svelte';

  /** A checkbox, its label beside it, and a hint below: a native one, posting its `name` as a form would. */
  const { Story } = defineMeta({
    title: 'Forms/Checkbox',
    component: Checkbox,
    tags: ['autodocs'],
    args: { id: 'consent', name: 'consent' },
  });
</script>

<Story
  name="With a link in its label"
  args={{ hint: 'Asked once for each purchase.' }}
  play={async ({ canvas, userEvent }) => {
    const box = canvas.getByRole('checkbox', { name: /agree to the Terms and Conditions/ });
    await expect(box).not.toBeChecked();
    await expect(box).toHaveAccessibleDescription('Asked once for each purchase.');
    await userEvent.click(canvas.getByText(/I ask that my time be activated/));
    await expect(box).toBeChecked();
  }}>
  {#snippet template(args)}
    <Checkbox {...withoutChildren(args)}>
      I ask that my time be activated as soon as I pay, and agree to the <a href="#terms">Terms and Conditions</a>
    </Checkbox>
  {/snippet}
</Story>

<Story
  name="Described elsewhere"
  args={{ id: 'confirm', checked: true, 'aria-describedby': 'confirm-why' }}
  play={async ({ canvas }) => {
    await expect(canvas.getByRole('checkbox', { name: 'I understand that this cannot be undone' })).toBeChecked();
    await expect(canvas.getByRole('checkbox')).toHaveAccessibleDescription('Your profile and everything in it go.');
  }}>
  {#snippet template(args)}
    <p id="confirm-why">Your profile and everything in it go.</p>
    <Checkbox {...withoutChildren(args)}>I understand that this cannot be undone</Checkbox>
  {/snippet}
</Story>
