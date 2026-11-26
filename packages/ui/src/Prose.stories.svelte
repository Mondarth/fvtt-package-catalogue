<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { expect } from 'storybook/test';

  import Prose from './Prose.svelte';

  /**
   * A page meant to be read, such as the Terms: its text kept to a readable width (`layout.content`), in the middle of
   * the application's full-width frame. Every other page takes the frame's whole width.
   */
  const { Story } = defineMeta({ title: 'Layout/Prose', component: Prose, tags: ['autodocs'] });
</script>

<Story
  name="Terms"
  asChild
  play={async ({ canvas }) => {
    const text = canvas.getByText(/^These terms/);
    const prose = text.parentElement;
    await expect(prose).not.toBeNull();
    // No wider than the readable width, 48rem.
    await expect(prose?.getBoundingClientRect().width).toBeLessThanOrEqual(48 * 16);
  }}>
  <Prose>
    <h1>Terms</h1>
    <p>
      These terms say what you agree to by using Mondarth's websites. A page meant to be read keeps its lines to a
      readable length, however wide the window, so that the eye finds the start of the next line easily; the rest of an
      application uses the window's whole width.
    </p>
  </Prose>
</Story>
