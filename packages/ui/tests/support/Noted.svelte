<!-- A notice, and a callout, each saying what they are given. -->
<script lang="ts">
  import Callout from '../../src/Callout.svelte';
  import Notice from '../../src/Notice.svelte';

  let { text, id }: { text: string; id: string } = $props();
</script>

<Notice>{text}</Notice>
<Callout {id}>{text}</Callout>
