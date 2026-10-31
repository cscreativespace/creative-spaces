# Creative Spaces launch video — review branch

This branch integrates a 55-second, 720p launch film into the **existing** Vercel/GitHub static site, beneath the image reel and above "Why it matters." The film includes a previously mixed synthetic narrator and English captions; it is not the separate unexported professional voice recording.

## Binary asset required before merge

Upload **creative-spaces-launch.mp4** to `public/videos/creative-spaces-launch.mp4` on this feature branch. The file is in the ZIP supplied in the Creative Spaces ChatGPT conversation, under the same path (7.5 MB). GitHub's browser upload supports this file size.

Until the media file is present the video section deliberately stays hidden to avoid a broken player. Never merge until the preview confirms it appears and plays.

## Verification

1. The video appears beneath the moving photo reel, with the correct poster, 16:9 responsive player and mobile layout.
2. The 55-second MP4 loads, plays and produces sound; caption controls work in Chrome and Safari.
3. The "Start your project" button leads to the existing `#start` section.
4. Existing Stripe checkout links, pricing, mobile navigation and booking remain intact.
5. Merge only after preview validation. Rebuilds from the separately referenced editable source repository may replace compiled HTML, so port this addition into the upstream source as well.
