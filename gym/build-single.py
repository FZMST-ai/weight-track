#!/usr/bin/env python3
"""Bundle the gym tracker into one self-contained HTML file.

Inlines styles.css, the three scripts and every photo (re-encoded smaller as
base64 data URIs) so the result works offline from a single file.

    python3 gym/build-single.py            # writes gym/dist/gym-tracker.html
Needs ImageMagick (`convert`) to shrink the photos; without it they're embedded as-is.
"""
import base64, os, re, shutil, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dist", "gym-tracker.html")
WIDTH, QUALITY = "480", "68"


def read(*p):
    with open(os.path.join(HERE, *p), encoding="utf-8") as f:
        return f.read()


def shrink(path, tmp):
    if not shutil.which("convert"):
        return open(path, "rb").read()
    out = os.path.join(tmp, "x.jpg")
    subprocess.run(["convert", path, "-resize", WIDTH + "x>", "-strip", "-quality", QUALITY, "-interlace", "Plane", out], check=True)
    return open(out, "rb").read()


def images():
    root = os.path.join(HERE, "img")
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for d in sorted(os.listdir(root)):
            for f in sorted(os.listdir(os.path.join(root, d))):
                if f.endswith(".jpg"):
                    data = shrink(os.path.join(root, d, f), tmp)
                    out[f"{d}/{f}"] = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    return out


def main():
    html = read("index.html")
    safe = lambda js: js.replace("</script", "<\\/script")
    html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + read("styles.css") + "\n</style>")
    imgs = images()
    entries = ",\n".join(f'"{k}":"{v}"' for k, v in imgs.items())
    scripts = "<script>window.GT_IMAGES={\n" + entries + "\n};</script>\n"
    for name in ("data.js", "store.js", "app.js"):
        tag = f'<script src="js/{name}"></script>'
        if tag not in html:
            raise SystemExit("index.html is missing " + tag)
        html = html.replace(tag, (scripts if name == "data.js" else "") + "<script>\n" + safe(read("js", name)) + "\n</script>")
    # In a standalone file there is no Weight Log next to it.
    html = re.sub(r'\s*<a class="nav-ext" href="\.\./">Weight Log ↗</a>', "", html)
    html = html.replace('<p class="small">Also in this project: <a href="../">Weight Log</a> for tracking body weight.</p>', "")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote {OUT} ({os.path.getsize(OUT) / 1048576:.1f} MB, {len(imgs)} images)")


if __name__ == "__main__":
    main()
