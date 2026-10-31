# APEX opening: review note

**Film.** 7.4 s, silent, 30 fps, one continuous camera move. Embers on black, blocks fall and lock into "APEX",
fire catches below, the camera tips over and dives through it, backs out, and lands where each voxel sits under
the flat title. The voxels then fade, leaving the same flat title as the page.

**Creative calls.** The letters are read from the Jersey 10 font itself, so they are the page title's own pixels.
Silent, because browsers only autoplay muted video and this is a short opening. The portrait cut has its own framing,
with the title on two lines as on a phone. No alternative storylines were built: the user's request set this one.

**Measured.** `hyperframes check` passes with `ok: true`. Frames looked at: 2.5, 3.4, 4.6, 5.0, 5.4, 5.7, 6.3 and 7.3 s
landscape; 2.5, 3.4, 5.0 and 7.3 s portrait. Nobody has watched it on a real phone. The motion was judged from stills.

**Weakest shot.** 4.2-4.6 s, inside the fire: the cubes are large and plain. With more time they would break into
smaller cubes near the camera. Small black gaps between low cubes also show in the portrait cut's last frames.

**Warnings kept.** `canvas_content_at_edge`: full-bleed fire and falling blocks are meant to touch the edge.
`audio_none`: silent on purpose.

**Portrait cut.** Copy this folder, swap 1920 and 1080 in `index.html`, render the copy. `film.js` reframes from the root's size.
