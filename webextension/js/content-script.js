async function delayAnimation(delay = 350) {
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

async function doAnimation(element, property, value) {
  return new Promise((resolve) => {
    const handler = () => {
      resolve();
      element.removeEventListener("transitionend", handler);
    };
    element.addEventListener("transitionend", handler);
    window.requestAnimationFrame(() => {
      element.style[property] = value;
    });
  });
}

async function addMessage(message) {
  const divElement = document.createElement("div");
  divElement.classList.add("container-notification");
  // For the eager eyed, this is an experiment. It is however likely that a website will know it is "contained" anyway
  divElement.innerText = message.text;

  const imageElement = document.createElement("img");
  imageElement.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAXCAYAAAARIY8tAAABHUlEQVRIx+2TTUoDQRCFv2nGGIKIR/AQLly48AJv4TEUFPwBceHCGCS6ET2FS6GO4DVceABBFILjZBA3I7Qx09MzkGz0QdPd9arqdRXViaQR0KMeH2bWnUZIegA2gKGZnfici0wOsBjp9wOuTVATpE0DJCXA6UTlq+W+KWno2V8bCwDLwFkFt16u9hUAI+AeWPJsa8AK8AQ8evaXxgJmVgBbE237nqK7aVM0Uzggj/Qt2gpcRojkwFWAfy73t1l35BeStoGSeoR/d2Zm74mkC+AIWAg4j4FrMzsuk98AuzUP/AQGDjisSU7JH3j3nYjqHbDtgE5kV9KKcwidufyDf4E/IJBF+uYV5xCyFOgD+4RnuwBuvfs5sFcTMwYGXytuPJJNdvDpAAAAAElFTkSuQmCC';
  divElement.prepend(imageElement);

  document.body.appendChild(divElement);

  await delayAnimation(100);
  await doAnimation(divElement, "transform", "translateY(0)");
  await delayAnimation(3000);
  await doAnimation(divElement, "transform", "translateY(-100%)");

  divElement.remove();
}

browser.runtime.onMessage.addListener((message) => {
  addMessage(message);
});
