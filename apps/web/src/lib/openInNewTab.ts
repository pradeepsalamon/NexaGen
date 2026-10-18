/**
 * Opens a new tab for a URL that is only known after an await (a signed
 * recording link). The tab is opened synchronously, inside the click, so a
 * popup blocker allows it; it is cut off from this page (no `opener`) and then
 * pointed at the URL once it arrives. Throws when the browser blocked the tab
 * or the URL could not be fetched, closing the empty tab.
 */
export async function openInNewTab(getUrl: () => Promise<string | null | undefined>): Promise<void> {
  const tab = window.open("", "_blank");
  if (!tab) throw new Error("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  tab.opener = null;

  try {
    const url = await getUrl();
    if (!url) throw new Error("No link is available.");
    tab.location.href = url;
  } catch (error) {
    tab.close();
    throw error;
  }
}
