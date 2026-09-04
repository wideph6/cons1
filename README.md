# Vercel PDF Download Test

## Deploy
1. Put your PDF at `public/files/test.pdf`.
2. Deploy this folder/project to Vercel.
3. Open:
   `https://YOUR-DOMAIN.vercel.app/files/test.pdf`

The Vercel header configuration sets `Content-Disposition: attachment`, so the PDF is requested as a download rather than displayed in the browser.

## Important
This project is for a **fixed/static PDF**. It does not provide a web upload form or permanent file storage. For many/dynamic PDFs, use storage such as Cloudflare R2 or Supabase Storage.
