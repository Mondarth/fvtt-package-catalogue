<script lang="ts">
  import { page } from '$app/state';
  import { m } from '#lib/paraglide/messages.js';
</script>

<h1>{m.error_heading({ status: page.status })}</h1>
<p>{page.status === 404 ? m.error_not_found() : m.error_other()}</p>
