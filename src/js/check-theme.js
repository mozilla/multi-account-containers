/* eslint-disable linebreak-style */
/* eslint-disable no-redeclare */
/* eslint-disable no-var */
/* eslint-disable quotes */

function getStyle(themeInfo) {
  
  if (themeInfo.colors.toolbar) 
  {
  
    document.body.style.backgroundColor= themeInfo.colors.toolbar;
  
    document.getElementById('current-tab').style.color=themeInfo.colors.tab_background_text;
   
    const colorChangingText = document.getElementsByClassName("tabBackgroundText");
    for (var i = 0; i < colorChangingText.length; i++) {
      colorChangingText[i].style.color =themeInfo.colors.tab_background_text;
    } 

  
    document.getElementById('sort-containers-link').style.color=themeInfo.colors.tab_background_text;
 
    
  }   

}
async function getCurrentThemeInfo() 
{
  var themeInfo = await browser.theme.getCurrent();
  
  getStyle(themeInfo);
}
getCurrentThemeInfo();
