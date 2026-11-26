<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect, fn } from 'storybook/test';

  import LanguagePicker from './LanguagePicker.svelte';

  /** Every language the application is in, each named in itself, the one the page is in chosen. */
  const { Story } = defineMeta({
    title: 'Navigation/LanguagePicker',
    component: LanguagePicker,
    tags: ['autodocs'],
    args: { label: 'Language', locales: ['en', 'es'], current: 'en', choose: fn() },
  });
</script>

<Story
  name="Default"
  play={async ({ canvas, userEvent, args }) => {
    const picker = canvas.getByRole('combobox', { name: 'Language' });
    await expect(picker).toHaveValue('en');
    await expect(canvas.getAllByRole('option').map(option => [option.textContent, option.lang])).toEqual([
      ['English', 'en'],
      ['Español', 'es'],
    ]);
    // Choosing the one it is in already switches nothing; choosing another switches to it.
    await userEvent.selectOptions(picker, 'en');
    await expect(args.choose).not.toHaveBeenCalled();
    await userEvent.selectOptions(picker, 'es');
    await expect(args.choose).toHaveBeenCalledTimes(1);
    await expect(args.choose).toHaveBeenCalledWith('es');
  }} />
