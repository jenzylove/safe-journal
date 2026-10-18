// Copies the single-file reader into public/ (served by the app) and reader/ (committed, downloadable).
import { copyFileSync } from "node:fs";
copyFileSync("dist-reader/reader.html", "public/reader.html");
copyFileSync("dist-reader/reader.html", "reader/safe-journal-reader.html");
