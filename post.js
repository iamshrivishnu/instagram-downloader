const puppeteer = require("puppeteer");
const fs = require("fs");
const https = require("https");

const CREDS = {
  username: "<username>",
  password: "<password>",
};

const instagramBaseURL = "https://www.instagram.com/";
const postURL = "https://www.instagram.com/p/CLFaCaPpY7p/";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 10,
    args: ["--start-maximized" /* you can also use '--start-fullscreen' */],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1900, height: 1050 });
  await page.goto(instagramBaseURL, {
    waitUntil: "networkidle0",
  });
  await page.type('[name="username"]', CREDS.username);
  await page.type('[name="password"]', CREDS.password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({
    waitUntil: "networkidle0",
  });
  await page.goto(postURL, {
    waitUntil: "networkidle0",
  });
  const download = (url) =>
    new Promise((resolve, reject) => {
      const filename = new URL(url).pathname.split("/")?.slice(-1)?.toString();
      const file = fs.createWriteStream("./download/" + filename);

      https
        .get(url, (response) => {
          response.pipe(file);

          file.on("finish", () => {
            file.close(resolve(true));
          });
        })
        .on("error", (error) => {
          fs.unlink(destination);

          reject(error.message);
        });
    });

  await page.goto(instagramBaseURL + profileName, {
    waitUntil: "networkidle0",
  });

  const downloadPost = (href) => {
    return new Promise(async (resolve) => {
      const postPage = await browser.newPage();
      await postPage.setViewport({ width: 1900, height: 1050 });
      await postPage.goto(href, {
        waitUntil: "networkidle0",
      });
      for (; true; ) {
        const rightArrow = await postPage.$(".coreSpriteRightChevron");
        if (rightArrow) {
          await postPage.click(".coreSpriteRightChevron");
        } else {
          break;
        }
      }
      const imageSrcs = await postPage.$$eval("img", (image) =>
        image
          .filter(
            (element) => element.srcset && / \d{3,4}w/g.test(element.srcset)
          )
          .map((element) =>
            element.srcset
              .split(",")
              .slice(-1)
              .join("")
              .replace(/ \d{3,4}w/g, "")
          )
      );
      for (let innerIndex = 0; innerIndex < imageSrcs.length; innerIndex++) {
        if (imageSrcs[innerIndex]) await download(imageSrcs[innerIndex]);
      }
      const videoSrcs = await postPage.$$eval("video", (video) =>
        video.filter((element) => element.src).map((element) => element.src)
      );
      for (let innerIndex = 0; innerIndex < videoSrcs.length; innerIndex++) {
        if (videoSrcs[innerIndex]) await download(videoSrcs[innerIndex]);
      }
      await postPage.waitForTimeout(100);
      await postPage.close();
    });
  };

  await downloadPost();
  console.log("Download Complete");
})();
