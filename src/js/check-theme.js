/* eslint-disable linebreak-style */
/* eslint-disable no-redeclare */
/* eslint-disable no-var */
/* eslint-disable quotes */

function getStyle(themeInfo) {
  
  if (themeInfo.colors.toolbar) 
  {
  
    document.body.style.backgroundColor= themeInfo.colors.toolbar;
  
    document.getElementById('current-tab').style.color=themeInfo.colors.tab_background_text;
   
    const headers = document.getElementsByTagName('h3');
    for (var i = 0; i < headers.length; i++) {
      headers[i].style.color =themeInfo.colors.tab_background_text;
    } 

    const paras= document.getElementsByTagName('p');
    for (var i = 0; i < paras.length; i++) {
      paras[i].style.color =themeInfo.colors.tab_background_text;
    } 
   
    document.getElementById('sort-containers-link').style.color=themeInfo.colors.tab_background_text;

    var legends1= document.getElementsByTagName('legend');
    for (var i = 0; i < legends1.length; i++) {
      legends1[i].style.color =themeInfo.colors.tab_background_text;
    } 
    
  }   

}
async function getCurrentThemeInfo() 
{
  var themeInfo = await browser.theme.getCurrent();
  
  getStyle(themeInfo);
}
getCurrentThemeInfo();
