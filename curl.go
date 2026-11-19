package main

// A pasted cURL command as a request in the catalog.
//
// The command is read the way a POSIX shell would read it: quotes,
// backslash escapes, and the `\` line continuations browsers emit when
// they copy a request. `^` continuations are read too, because the
// Windows cmd build of curl is what most people paste from there.
//
// The point is fidelity, not tidiness: whatever the command said about the
// request is kept, and whatever cannot be kept is reported instead of
// silently dropped.

import (
	"fmt"
	"net/url"
	"strings"
	"time"
)

// CurlImport is what a pasted command became, plus what could not be carried.
type CurlImport struct {
	Profile Profile `json:"profile"`
	// RequestID is the imported request, so the caller can select it. The
	// profile it lands in may hold other requests already.
	RequestID string   `json:"requestId"`
	Warnings  []string `json:"warnings,omitempty"`
}

// curlFlagsWithValue are the short flags curl writes without a space when the
// value follows immediately, as in `-XPOST` or `-H'Name: value'`.
const curlFlagsWithValue = "XHduAbnemFoAxwTc"

// curlWords splits a command line into words the way a POSIX shell does.
func curlWords(text string) []string {
	var out []string
	var word strings.Builder
	inWord := false
	rs := []rune(strings.TrimSpace(text))
	flush := func() {
		if inWord {
			out = append(out, word.String())
			word.Reset()
			inWord = false
		}
	}
	for i := 0; i < len(rs); {
		switch c := rs[i]; c {
		case '\'':
			// Single quotes take everything literally, including backslashes.
			inWord = true
			i++
			for i < len(rs) && rs[i] != '\'' {
				word.WriteRune(rs[i])
				i++
			}
			if i < len(rs) {
				i++
			}
		case '"':
			inWord = true
			i++
			for i < len(rs) && rs[i] != '"' {
				if rs[i] == '\\' && i+1 < len(rs) {
					switch next := rs[i+1]; next {
					case '"', '\\', '$', '`':
						word.WriteRune(next)
						i += 2
						continue
					case '\n':
						i += 2
						continue
					case '\r':
						i += 2
						if i < len(rs) && rs[i] == '\n' {
							i++
						}
						continue
					}
				}
				word.WriteRune(rs[i])
				i++
			}
			if i < len(rs) {
				i++
			}
		case '\\':
			i++
			if i >= len(rs) {
				continue
			}
			switch next := rs[i]; next {
			case '\n':
				// A continuation: the command goes on, no word breaks.
				i++
			case '\r':
				i++
				if i < len(rs) && rs[i] == '\n' {
					i++
				}
			default:
				inWord = true
				word.WriteRune(next)
				i++
			}
		case '^':
			// cmd's continuation; PowerShell's backtick is left alone because
			// it is also an escape inside quoted text.
			if i+1 < len(rs) && (rs[i+1] == '\n' || rs[i+1] == '\r') {
				i++
				if i < len(rs) && rs[i] == '\r' {
					i++
				}
				if i < len(rs) && rs[i] == '\n' {
					i++
				}
				continue
			}
			inWord = true
			word.WriteRune(c)
			i++
		case ' ', '\t', '\n', '\r':
			flush()
			i++
		default:
			inWord = true
			word.WriteRune(c)
			i++
		}
	}
	flush()
	return out
}

// splitCurlFlag separates a flag from a value stuck to it: `--data=x` and
// `-XPOST` both carry their value in the same word.
func splitCurlFlag(word string) (flag, value string, attached bool) {
	if strings.HasPrefix(word, "--") {
		if k, v, ok := strings.Cut(word, "="); ok {
			return k, v, true
		}
		return word, "", false
	}
	if len(word) > 2 && word[0] == '-' && word[1] != '-' {
		if strings.ContainsRune(curlFlagsWithValue, rune(word[1])) {
			return word[:2], word[2:], true
		}
	}
	return word, "", false
}

// parseCurlCommand reads one command into a profile holding one request.
// Warnings describe the parts that could not be kept as written.
func parseCurlCommand(text, module string) (Profile, []string, error) {
	words := curlWords(text)
	if len(words) == 0 {
		return Profile{}, nil, fmt.Errorf("没有内容")
	}
	start := -1
	for i, w := range words {
		base := strings.ToLower(w)
		if base == "curl" || base == "curl.exe" || strings.HasSuffix(base, "/curl") || strings.HasSuffix(base, "\\curl.exe") {
			start = i
			break
		}
	}
	if start < 0 {
		return Profile{}, nil, fmt.Errorf("这不是一条 cURL 命令（要以 curl 开头）")
	}

	var (
		warnings    []string
		method      string
		rawURL      string
		headers     []HeaderItem
		dataParts   []string
		formFields  []HeaderItem
		authUser    string
		authPass    string
		hasAuth     bool
		headOnly    bool
		toQuery     bool
		follows     bool
		insecure    bool
		sawDigest   bool
		bodyIsAFile bool
	)

	next := func(i *int) (string, bool) {
		if *i+1 >= len(words) {
			return "", false
		}
		*i++
		return words[*i], true
	}

	for i := start + 1; i < len(words); i++ {
		flag, attachedValue, attached := splitCurlFlag(words[i])
		value := func() (string, bool) {
			if attached {
				return attachedValue, true
			}
			return next(&i)
		}

		switch flag {
		case "-X", "--request":
			if v, ok := value(); ok {
				method = strings.ToUpper(strings.TrimSpace(v))
			}
		case "-H", "--header":
			v, ok := value()
			if !ok {
				continue
			}
			name, headerValue, found := strings.Cut(v, ":")
			name = strings.TrimSpace(name)
			if !found || name == "" {
				continue
			}
			// A header written `Name;` carries no value; curl sends it empty.
			headers = append(headers, HeaderItem{
				Key:     name,
				Value:   strings.TrimSpace(headerValue),
				Enabled: true,
			})
		case "-d", "--data", "--data-ascii", "--data-raw", "--data-binary":
			v, ok := value()
			if !ok {
				continue
			}
			if strings.HasPrefix(v, "@") && flag != "--data-raw" {
				bodyIsAFile = true
			}
			dataParts = append(dataParts, v)
		case "--data-urlencode":
			v, ok := value()
			if !ok {
				continue
			}
			if name, raw, found := strings.Cut(v, "="); found {
				dataParts = append(dataParts, name+"="+url.QueryEscape(raw))
			} else {
				dataParts = append(dataParts, url.QueryEscape(v))
			}
		case "-F", "--form":
			v, ok := value()
			if !ok {
				continue
			}
			name, fieldValue, found := strings.Cut(v, "=")
			if !found || strings.TrimSpace(name) == "" {
				continue
			}
			formFields = append(formFields, HeaderItem{
				Key:     strings.TrimSpace(name),
				Value:   fieldValue,
				Enabled: true,
			})
			if strings.Contains(fieldValue, "@") {
				warnings = append(warnings, fmt.Sprintf("表单字段 %s 的值 %s 指向文件，这里按文本存下，不会真的上传", name, fieldValue))
			}
		case "-u", "--user":
			if v, ok := value(); ok {
				hasAuth = true
				authUser, authPass, _ = strings.Cut(v, ":")
			}
		case "-A", "--user-agent":
			if v, ok := value(); ok {
				headers = append(headers, HeaderItem{Key: "User-Agent", Value: v, Enabled: true})
			}
		case "-b", "--cookie":
			if v, ok := value(); ok {
				headers = append(headers, HeaderItem{Key: "Cookie", Value: v, Enabled: true})
			}
		case "-e", "--referer":
			if v, ok := value(); ok {
				headers = append(headers, HeaderItem{Key: "Referer", Value: v, Enabled: true})
			}
		case "--url":
			if v, ok := value(); ok {
				rawURL = v
			}
		case "-I", "--head":
			headOnly = true
		case "-G", "--get":
			toQuery = true
		case "-L", "--location", "--location-trusted":
			follows = true
		case "-k", "--insecure":
			insecure = true
		case "--digest":
			sawDigest = true
		case "-o", "--output", "-m", "--max-time", "--connect-timeout", "-x", "--proxy",
			"-w", "--write-out", "--cacert", "--cert", "--key", "-c", "--cookie-jar",
			"-T", "--upload-file", "--resolve", "--retry", "--limit-rate", "-E", "-r", "--range":
			// Flags whose value changes nothing about the request we keep.
			if !attached {
				next(&i)
			}
		case "-s", "-S", "-i", "-v", "-f", "--fail", "--compressed", "--silent", "--show-error",
			"-N", "--no-buffer", "-g", "--globoff", "-#", "--progress-bar":
			// Switches with no value.
		default:
			if !strings.HasPrefix(flag, "-") && rawURL == "" {
				rawURL = flag
			}
		}
	}

	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return Profile{}, nil, fmt.Errorf("命令里没有地址")
	}
	if !hasURLScheme(rawURL) {
		if strings.HasPrefix(rawURL, "//") {
			rawURL = "https:" + rawURL
		} else {
			rawURL = "https://" + rawURL
		}
	}
	if _, err := url.Parse(rawURL); err != nil {
		return Profile{}, nil, fmt.Errorf("地址无效：%w", err)
	}

	body := strings.Join(dataParts, "&")
	if toQuery {
		// -G moves the data into the query string and leaves no body.
		if body != "" {
			sep := "?"
			if strings.Contains(rawURL, "?") {
				sep = "&"
			}
			rawURL += sep + body
			body = ""
		}
	}

	if bodyIsAFile {
		warnings = append(warnings, "请求体用 @文件 读自磁盘，这里把 @路径 当文本存下了")
	}
	if sawDigest {
		warnings = append(warnings, "--digest 没有对应设置，先按 Basic 认证存下")
	}

	// The method: named, or implied by what the command carries.
	effective := method
	switch {
	case effective != "":
	case headOnly:
		effective = "HEAD"
	case body != "" || len(formFields) > 0:
		effective = "POST"
	default:
		effective = "GET"
	}
	if methodOmitsBody(effective) && (body != "" || len(formFields) > 0) {
		// The editor would drop a body on GET/HEAD, so the request would not
		// send what the command sends. POST is the closest thing it can keep.
		warnings = append(warnings, fmt.Sprintf("%s 带请求体，改存为 POST 才留得住", effective))
		effective = "POST"
	}
	if headOnly && effective == "GET" {
		effective = "HEAD"
	}

	// The body's type: what Content-Type says, else what it looks like.
	contentType := ""
	keptHeaders := make([]HeaderItem, 0, len(headers))
	for _, h := range headers {
		if strings.EqualFold(h.Key, "Content-Type") {
			contentType = strings.ToLower(strings.TrimSpace(h.Value))
		}
		keptHeaders = append(keptHeaders, h)
	}

	bodyType := "none"
	bodyText := body
	formRows := []HeaderItem(nil)
	switch {
	case len(formFields) > 0:
		if len(dataParts) > 0 {
			warnings = append(warnings, "-F 与 -d 混用，只留了 -F 的字段")
		}
		bodyType = "form"
		formRows = formFields
		bodyText = ""
		if !strings.Contains(contentType, "multipart") {
			warnings = append(warnings, "-F 是 multipart 上传，这里的表单按 urlencoded 发，字段名和值都留着")
		}
	case bodyText == "":
		bodyType = "none"
	default:
		switch {
		case strings.Contains(contentType, "json"):
			bodyType = "json"
		case strings.Contains(contentType, "x-www-form-urlencoded"):
			bodyType = "form"
			formRows = formRowsFromEncoded(bodyText)
			bodyText = ""
		case strings.Contains(contentType, "xml"):
			// The editor's body-type radios are none / json / text / form; an
			// XML body shows in the text editor and keeps its Content-Type row,
			// which is what actually goes on the wire.
			bodyType = "text"
		case strings.HasPrefix(contentType, "text/"):
			bodyType = "text"
		case looksLikeJSON(bodyText):
			bodyType = "json"
		case contentType == "":
			// curl sends `-d` as application/x-www-form-urlencoded unless a
			// Content-Type says otherwise, so a body with no type is a form
			// when it reads as one, and text otherwise.
			if rows, ok := formRowsIfEncoded(bodyText); ok {
				bodyType = "form"
				formRows = rows
				bodyText = ""
			} else {
				bodyType = "text"
			}
		default:
			bodyType = "text"
		}
	}

	req := SavedRequest{
		ID:         newRequestID(),
		Kind:       "http",
		Method:     effective,
		URL:        rawURL,
		HeaderList: keptHeaders,
		AuthType:   "none",
		BodyType:   bodyType,
		Body:       bodyText,
		FormList:   formRows,
		Module:     normalizeModulePath(module),
		UpdatedAt:  time.Now().UnixMilli(),
	}
	if hasAuth {
		req.AuthType = "basic"
		req.AuthUser = authUser
		req.AuthPass = authPass
	}
	req.Name = clipRunes(requestNameFromURL(effective, rawURL), 80)
	req.Title = ""
	req = normalizeSavedRequest(req)

	host := importHostFromURL(rawURL)
	if host == "" {
		return Profile{}, nil, fmt.Errorf("无法从地址判断主机：%s", rawURL)
	}
	p := Profile{
		Name:     host,
		URL:      host,
		Protocol: "http",
		// curl does not follow redirects unless asked, so a command without -L
		// is imported as one that does not follow.
		NoFollowRedirects:  !follows,
		InsecureSkipVerify: insecure,
		Requests:           []SavedRequest{req},
		Headers:            map[string]string{},
	}
	if module != "" {
		p.Modules = []string{normalizeModulePath(module)}
	}
	return p, warnings, nil
}

// formRowsFromEncoded turns `a=1&b=2` into editable rows, keeping the bytes
// when a pair does not decode.
func formRowsFromEncoded(body string) []HeaderItem {
	rows, _ := formRowsIfEncoded(body)
	return rows
}

// formRowsIfEncoded reports whether the text reads as a urlencoded form at
// all. `a=1&b=2` does; `{"a":1}` and a stray sentence do not, and those must
// not be turned into one-row forms with the whole body as a key.
func formRowsIfEncoded(body string) ([]HeaderItem, bool) {
	if !strings.Contains(body, "=") {
		return nil, false
	}
	rows := make([]HeaderItem, 0, 4)
	for _, pair := range strings.Split(body, "&") {
		if pair == "" {
			continue
		}
		name, value, found := strings.Cut(pair, "=")
		if !found {
			return nil, false
		}
		key, err := url.QueryUnescape(name)
		if err != nil {
			return nil, false
		}
		decoded, err := url.QueryUnescape(value)
		if err != nil {
			return nil, false
		}
		rows = append(rows, HeaderItem{Key: key, Value: decoded, Enabled: true})
	}
	if len(rows) == 0 {
		return nil, false
	}
	return rows, true
}

// ImportCurl turns a pasted cURL command into catalog entries, written the
// same way a file import is: split by host, create what is missing, merge.
// `-k` in the command is what decides certificate checking; there is no
// separate switch, so the command is the single source of truth.
func (a *App) ImportCurl(command string, module string) (*CurlImport, error) {
	a.profileMu.Lock()
	defer a.profileMu.Unlock()

	src, warnings, err := parseCurlCommand(command, module)
	if err != nil {
		return nil, err
	}
	want := src.Requests[0]
	merged, err := a.applyImportedProfiles([]Profile{src})
	if err != nil {
		return nil, err
	}
	if merged == nil {
		return nil, fmt.Errorf("没有可导入的内容")
	}
	// A command that matches an existing request updates it in place and keeps
	// that row's id, so the id to select is read back rather than assumed.
	requestID := ""
	for _, r := range merged.Requests {
		if r.ID == want.ID {
			requestID = r.ID
			break
		}
	}
	if requestID == "" {
		// Deduped against an existing row: pick the one it merged into.
		for _, r := range merged.Requests {
			if strings.EqualFold(r.Method, want.Method) && r.URL == want.URL {
				requestID = r.ID
				break
			}
		}
	}
	if requestID == "" {
		requestID = want.ID
	}
	return &CurlImport{Profile: *merged, RequestID: requestID, Warnings: warnings}, nil
}
