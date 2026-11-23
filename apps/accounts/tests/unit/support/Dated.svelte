<!-- A date, written as a page writes them. -->
<script lang="ts">
  import { useDates } from '@mondarth/ui/dates';

  let { when }: { when: Date } = $props();

  const { date } = useDates(() => 'en-US');
</script>

<span data-testid="date">{date(when)}</span>
