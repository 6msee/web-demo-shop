<?php
// พร็อกซีรูปสำหรับฉาก 3 มิติ
// WebGL ใช้รูปจากเว็บอื่นได้เฉพาะเมื่อเว็บนั้นอนุญาต (CORS) — ไฟล์นี้ดึงรูปมาเสิร์ฟจากโดเมนเดียวกันแทน
// ใช้: img.php?u=https://example.com/photo.webp
declare(strict_types=1);

function fail(int $code): void { http_response_code($code); header('Cache-Control: no-store'); exit; }

$u = isset($_GET['u']) ? trim((string) $_GET['u']) : '';
if ($u === '' || strlen($u) > 2000 || !preg_match('~^https?://~i', $u)) fail(400);
$host = parse_url($u, PHP_URL_HOST);
if (!$host) fail(400);

// กันการใช้ไฟล์นี้เข้าถึงเครื่องในวงแลน/ตัวเอง (SSRF): อนุญาตเฉพาะ IP สาธารณะ
$ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
if (!$ips) fail(404);
foreach ($ips as $ip) {
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) fail(403);
}

$dir = __DIR__ . '/cache/img';
if (!is_dir($dir)) @mkdir($dir, 0775, true);
$key = $dir . '/' . sha1($u);
$ttl = 7 * 86400;

function serve(string $type, string $body): void {
  header('Content-Type: ' . $type);
  header('Content-Length: ' . strlen($body));
  header('Cache-Control: public, max-age=604800');
  header('X-Content-Type-Options: nosniff');
  header('Access-Control-Allow-Origin: *');
  echo $body; exit;
}

// ใช้แคชในเครื่องก่อน (7 วัน)
if (is_file($key) && is_file($key . '.type') && filemtime($key) > time() - $ttl) {
  serve((string) file_get_contents($key . '.type'), (string) file_get_contents($key));
}

$max = 8 * 1024 * 1024;   // ไม่เกิน 8 MB
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
$body = ''; $type = '';

if (function_exists('curl_init')) {
  $ch = curl_init($u);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
    CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 15, CURLOPT_USERAGENT => $ua,
    CURLOPT_HTTPHEADER => ['Accept: image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8'],
    CURLOPT_SSL_VERIFYPEER => true,
  ]);
  $body = (string) curl_exec($ch);
  $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
  $err = curl_errno($ch);
  curl_close($ch);
  // XAMPP บางเครื่องไม่มีไฟล์ใบรับรอง → ลองใหม่แบบไม่ตรวจใบรับรอง (เป็นแค่รูป แสดงบนเครื่องตัวเอง)
  if ($err === 60 || $err === 77) {
    $ch = curl_init($u);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3,
      CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
      CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 15, CURLOPT_USERAGENT => $ua, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_SSL_VERIFYHOST => 0]);
    $body = (string) curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
  }
  if ($code < 200 || $code >= 300) fail(502);
} else {
  $ctx = stream_context_create(['http' => ['timeout' => 15, 'header' => "User-Agent: $ua\r\n", 'follow_location' => 1, 'max_redirects' => 3]]);
  $body = (string) @file_get_contents($u, false, $ctx);
  foreach (($http_response_header ?? []) as $h) if (stripos($h, 'Content-Type:') === 0) $type = trim(substr($h, 13));
}

if ($body === '' || strlen($body) > $max) fail(502);
// ตรวจจากเนื้อไฟล์จริง: รับเฉพาะรูป raster (ไม่รับ SVG/HTML)
$sniff = class_exists('finfo') ? ((new finfo(FILEINFO_MIME_TYPE))->buffer($body) ?: '') : '';
if ($sniff === '') { $gi = @getimagesizefromstring($body); $sniff = $gi['mime'] ?? ''; }
$okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
if (!in_array($sniff, $okTypes, true)) fail(415);

@file_put_contents($key, $body);
@file_put_contents($key . '.type', $sniff);
serve($sniff, $body);
