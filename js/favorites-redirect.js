const url = new URL('/browse/', location.href);
url.searchParams.set('following', '1');
location.replace(url.href);
