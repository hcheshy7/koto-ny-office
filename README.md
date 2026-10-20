# Koto NY Office

A live, pixel-art view of the Koto NY office. Everyone who opens the site sees the same office at the same moment. The whole day runs off the New York clock, and the street weather is live.

There is also a shared task box, where people add tasks for their character. It is switched off for now; to turn it back on, set `TASKS_URL` to `"/api/tasks"` near the top of `index.html`.

When someone opens the site, a **"Who is visiting?"** window asks them to pick their character. Someone from outside the team can pick **Guest** and type their name. The **Online now** panel in the bottom right shows who has the site open, and clicking a name follows that person around the office.

The **Chat** box, just above "Who's doing what" on the left, lets everyone online talk to each other. It has three views, switched with the buttons in its header: hidden (the default), just the message box, or the message box with past messages. Press Enter or Send to post. When a teammate sends a message, their character also says it in a speech bubble in the office for a few seconds.

Everyone can **drag the boxes** (the clock and weather column, chat, Who's doing what, Online now, and the key hints) to any spot along the edges of the screen. They always snap to the nearest edge and stay clear of the sign and the welcome banner. Each person's layout is remembered in their own browser.

**Walking around:** after picking their character, anyone can press an arrow key (or use the on-screen pad on a phone) to take over their character and walk around. Stopping on a chair sits in it. A sign over their desk says "Sit here to go back to work!", and sitting back at their own desk hands the character back to its normal day. Guests design a character in a farm-game style character screen (skin, 19 haircuts, 7 shirt styles, pants, shorts or a skirt, 15 accessory choices, and colour sliders for eyes, hair, shirt and pants) and appear at the lift, ready to walk around. They have no tasks and aren't added to Who's doing what. Everyone sees everyone else walking. Anyone walking around can stand at the mirror in the bathroom hall and click **Change my appearance** to restyle their character with the same screen. A teammate's new look, including their shirt colour in Who's doing what, is saved for everyone and stays that way until they change it again.

## What's in here

- `index.html`: the whole site.
- `api/tasks.js`: a small function that saves and loads the shared tasks.
- `api/chat.js`: a small function that keeps the last 200 chat messages. Each person can send at most one message every 1.5 seconds.
- `api/players.js`: a small function that shares the positions of everyone walking around. People send updates about once a second while they move.
- `api/looks.js`: a small function that saves teammates' new looks from the bathroom mirror.
- `api/online.js`: a small function that keeps track of who has the site open. Each open copy checks in every 20 seconds, and anyone quiet for a minute drops off the list.
- `package.json`: tells Vercel the function uses modern JavaScript. There are no packages to install.

## Put it online (about 10 minutes)

1. **Make a free Vercel account** at vercel.com. Signing in with GitHub is easiest.
2. **Upload the project.** Either:
   - put this folder in a new GitHub repository, then in Vercel choose **Add New → Project** and import it, or
   - run `npx vercel` inside this folder.

   Vercel needs no build settings.
3. **Add storage for the Online now panel and chat.** Open the project in Vercel, go to **Storage**, add **Upstash for Redis** (the free plan is fine), and connect it to this project. Vercel adds the keys the function needs.
4. **Redeploy.** Go to **Deployments → ⋯ → Redeploy** so the function picks up the new keys.
5. Share the `your-project.vercel.app` link. Anyone with it can watch and add tasks for their own character.

The office works without step 3, but the Online now panel and chat stay hidden until storage is connected.

## Good to know

- **Who can add tasks:** only the 36 team names are accepted. Each person can have up to 6 tasks. Tasks are short and placed in known spots, and the function checks them as they come in.
- **Removing tasks:** pick your name in the box, then click ✕ on a task.
- **Changing the site:** edit `index.html` and redeploy. Pushing to GitHub redeploys automatically if you used the GitHub route.
- **Custom address:** you can add one, like `office.koto.com`, under **Settings → Domains**.
