<!-- The root layout around a date, written as `useDates` writes them: in the locale the layout was given. -->
<script lang="ts">
  import Layout from '../../../src/routes/+layout.svelte';
  import Dated from './Dated.svelte';

  let { dateLocale, when }: { dateLocale: string; when: Date } = $props();
</script>

<Layout data={{ dateLocale, signedIn: null, returnTo: null }} params={{}}>
  <Dated locale={null} {when} />
</Layout>
