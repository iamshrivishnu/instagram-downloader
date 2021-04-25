const puppeteer = require("puppeteer");
const fs = require("fs");
const https = require("https");

const CREDS = {
  username: "<username>",
  password: "<password>",
};

const instagramBaseURL = "https://www.instagram.com/";
const profileNames = ['<profile1>'/*,'<profile2>'... */];

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

  for (let index = 0; index < profileNames.length; index++) {
    const profileName = profileNames[index];
    const getDestination = (url) => {
      const folder = "./download/" + profileName;
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
      }
      const filename = new URL(url).pathname.split("/").slice(-1).toString();
      return `${folder}/${filename}`;
    };

    const downloadList = {};
    const completedPosts = [];

    const download = (url) =>
      new Promise((resolve, reject) => {
        const filename = new URL(url).pathname
          .split("/")
          ?.slice(-1)
          ?.toString();
        const resolution = new URL(url).pathname
          .match(/(p\d{2,4}x\d{2,4})/g)
          ?.toString()
          ?.replace(/p\d{2,4}x/g, "");
        if (downloadList[filename]) {
          if (parseInt(resolution) > downloadList[filename]) {
            downloadList[filename] = parseInt(resolution);
          } else {
            resolve(true);
          }
        } else {
          downloadList[filename] = parseInt(resolution);
        }
        const destination = getDestination(url);
        const file = fs.createWriteStream(destination);

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

    const downloadPosts = (hrefs) => {
      return new Promise(async (resolve) => {
        for (let index = 0; index < hrefs.length; index++) {
          if (completedPosts.indexOf(hrefs[index]) !== -1) {
            continue;
          } else {
            const postPage = await browser.newPage();
            await postPage.setViewport({ width: 1900, height: 1050 });
            await postPage.goto(hrefs[index], {
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
                  (element) =>
                    element.srcset && / \d{3,4}w/g.test(element.srcset)
                )
                .map((element) =>
                  element.srcset
                    .split(",")
                    .slice(-1)
                    .join("")
                    .replace(/ \d{3,4}w/g, "")
                )
            );
            for (
              let innerIndex = 0;
              innerIndex < imageSrcs.length;
              innerIndex++
            ) {
              if (imageSrcs[innerIndex]) await download(imageSrcs[innerIndex]);
            }
            const videoSrcs = await postPage.$$eval("video", (video) =>
              video
                .filter((element) => element.src)
                .map((element) => element.src)
            );
            for (
              let innerIndex = 0;
              innerIndex < videoSrcs.length;
              innerIndex++
            ) {
              if (videoSrcs[innerIndex]) await download(videoSrcs[innerIndex]);
            }
            await postPage.waitForTimeout(100);
            await postPage.close();
            completedPosts.push(hrefs[index]);
          }
        }
        resolve();
      });
    };

    const fetchLinks = () => {
      return new Promise(async (resolve) => {
        let bodyHeight = await page.evaluate("document.body.scrollHeight");
        let previousHeight = 0;
        while (previousHeight < bodyHeight) {
          const fetchedHrefs = await page.$$eval("a", (links) =>
            links
              .filter((element) => /\/p\//g.test(element.href))
              .map((element) => element.href)
          );
          await downloadPosts(fetchedHrefs);
          await page.evaluate(`window.scrollTo(0, ${bodyHeight})`);
          await page.waitForTimeout(6000);
          previousHeight = bodyHeight;
          bodyHeight = await page.evaluate("document.body.scrollHeight");
          await page.waitForTimeout(2000);
          console.log(
            "Previous Height : ",
            previousHeight,
            " - Body Height : ",
            bodyHeight
          );
          if (previousHeight >= bodyHeight) {
            resolve();
          }
        }
      });
    };

    await fetchLinks();
    console.log("Completed "+profileName);
  }
  console.log("Download Complete");
})();
