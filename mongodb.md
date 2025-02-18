### 配置服务

mongod.exe --config "D:\Program Files\MongoDB\mongod.cfg" --install
mongod --dbpath "g:\Program Files\MongoDB\Server\6.0\data"
mongod --logpath "g:\Program Files\MongoDB\Server\6.0\log\mongod.log" -logappend
mongod.exe --remove

mongod --dbpath /opt/mongodb-linux-x86_64-rhel80-4.4.2/data --logpath /opt/mongodb-linux-x86_64-rhel80-4.4.2/log/mongod.log --logappend --auth --install
aLIsvK19s5qkNxbR

mongod --dbpath /opt/mongodb-linux-x86_64-rhel80-4.4.0/data --logpath /opt/mongodb-linux-x86_64-rhel80-4.4.0/log/mongod.log --fork --bind_ip_all --auth

mongod --dbpath /opt/mongodb-linux-x86_64-rhel80-4.4.2/data --logpath /opt/mongodb-linux-x86_64-rhel80-4.4.2/log/mongod.log --fork --bind_ip_all --auth

### 数据库密码

aLIsvK19s5qkNxbR

### 软链接

ln -s /opt/node-v15.4.0-linux-x64/bin/npm /usr/local/bin/npm
ln -s /opt/node-v15.4.0-linux-x64/bin/node /usr/local/bin/node

ln -s /opt/mongodb-linux-x86_64-rhel80-4.4.2/bin/mongo /usr/bin/mongo
ln -s /opt/mongodb-linux-x86_64-rhel80-4.4.2/bin/mongod /usr/bin/mongod

ln -s /opt/mongodb-database-tools-rhel80-x86_64-100.2.1/bin/mongodump /usr/bin/mongodump
ln -s /opt/mongodb-database-tools-rhel80-x86_64-100.2.1/bin/mongorestore /usr/bin/mongorestore

ln -s /opt/node-v15.4.0-linux-x64/bin/pm2 /usr/local/bin/pm2

### 创建用户

db.createUser({user:"admin",pwd:"aLIsvK19s5qkNxbR",roles:["root"],mechanisms : ["SCRAM-SHA-256"] })

db.createUser({
user: "anyuser",
pwd: "aLIsvK19s5qkNxbR",
roles: [ { role: "userAdminAnyDatabase", db: "admin" } ],
mechanisms : ["SCRAM-SHA-256"]
})

db.createUser({
user: "anydb",
pwd: "aLIsvK19s5qkNxbR",
roles: [ { role: "dbAdminAnyDatabase", db: "admin" } ],
mechanisms : ["SCRAM-SHA-256"]
})

db.createUser({
user: "ftbot",
pwd: "9SfaA4FtuvSV10P0",
roles: [ { role: "dbOwner", db: "ft" } ],
mechanisms : ["SCRAM-SHA-256"]
})

db.auth("admin", "aLIsvK19s5qkNxbR")
db.auth("anyuser", "aLIsvK19s5qkNxbR")
db.auth("anydb", "aLIsvK19s5qkNxbR")

db.system.users.find()

### 文档操作

db.createCollection("user", {autoIndexId:true})

### openssl

openssl genrsa -des3 -out rsa_private_key.pem 2048
openssl req -new -x509 -key rsa_private_key.pem -out rsa_cacert.pem -days 1095
openssl rsa -in rsa_private_key.pem -pubout -out rsa_public_key.pem
openssl pkcs8 -topk8 -inform PEM -in rsa_private_key.
pem -outform PEM -out pkcs8_rsa_private_key.pem –nocrypt

### 备份/恢复

mongodump -h 127.0.0.1 -u kirisakiaria -p aLIsvK19s5qkNxbR -d name_generator -o /opt/data
mongorestore -h 127.0.0.1 -u admin -p aLIsvK19s5qkNxbR --authenticationDatabase admin --authenticationMechanism SCRAM-SHA-256 -d name_generator /opt/data/name_generator

### git

git config --global user.username "kirisakiaria"
git config --global user.email "xiaoli350791904@hotmail.com"
ssh-keygen -t rsa -C "xiaoli350791904@hotmail.com"

### 后台

后台服务地址：06ABI4giPEw9lDKC9QKL

后台密码：d9yjIq#@9k3W3#CaHd21nZd$IXPE^&

服务器密码：K#N5I97e!%l5HWN$RtL$dg!w5Fbz6G

### 私钥密码

5tZJscynv0lSgIJjk!gfVc0OSn3Pw3

### 在 CentOS 8 上管理您的 NGINX 服务器

为了管理您的 NGINX 服务器，您有多种选择。

要检查 NGINX 的状态，您必须运行以下命令

$ sudo systemctl status nginx

要停止您的 NGINX 服务器，请运行

$ sudo systemctl stop nginx

如果要重新启动，则必须运行

$ sudo systemctl start nginx

如果您对 NGINX 服务器进行了一些修改，则可以重新加载它而不必停止并重新启动它。

要重新加载 NGINX，您只需运行

$ sudo systemctl reload nginx

如果您不想在引导时启动 NGINX 服务器，则必须通过运行来禁用它

$ sudo systemctl disable nginx

### id

100016759983

### cdn

bianzizai.com bianzizai.com.cdn.dnsv1.com
