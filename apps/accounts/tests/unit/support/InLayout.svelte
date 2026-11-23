<!-- The root layout around a date: written in the locale the layout was given. -->
<script lang="ts">
  import Layout from '../../../src/routes/+layout.svelte';
  import Dated from './Dated.svelte';

  let { dateLocale, when }: { dateLocale: string; when: Date } = $props();
</script>

<Layout data={{ dateLocale }} params={{}}>
  <Dated {when} />
</Layout>
