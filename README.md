# Koto NY Office

A live, pixel-art view of the Koto NY office. Everyone who opens the site sees the same office at the same moment. The whole day runs off the New York clock, and the street weather is live.

People can use the box along the bottom to pick their name and add tasks for their character, like "sketching posters with Thalia". Those tasks are saved for everyone, and every open copy picks them up within 30 seconds.

## What's in here

- `index.html`: the whole site.
- `api/tasks.js`: a small function that saves and loads the shared tasks.
- `package.json`: tells Vercel the function uses modern JavaScript. There are no packages to install.

## Put it online (about 10 minutes)

1. **Make a free Vercel account** at vercel.com. Signing in with GitHub is easiest.
2. **Upload the project.** Either:
   - put this folder in a new GitHub repository, then in Vercel choose **Add New → Project** and import it, or
   - run `npx vercel` inside this folder.

   Vercel needs no build settings.
3. **Add storage for the shared tasks.** Open the project in Vercel, go to **Storage**, add **Upstash for Redis** (the free plan is fine), and connect it to this project. Vercel adds the keys the function needs.
4. **Redeploy.** Go to **Deployments → ⋯ → Redeploy** so the function picks up the new keys.
5. Share the `your-project.vercel.app` link. Anyone with it can watch and add tasks for their own character.

The office works without step 3, but the task box shows an error when someone saves.

## Good to know

- **Who can add tasks:** only the 36 team names are accepted. Each person can have up to 6 tasks. Tasks are short and placed in known spots, and the function checks them as they come in.
- **Removing tasks:** pick your name in the box, then click ✕ on a task.
- **Changing the site:** edit `index.html` and redeploy. Pushing to GitHub redeploys automatically if you used the GitHub route.
- **Custom address:** you can add one, like `office.koto.com`, under **Settings → Domains**.
