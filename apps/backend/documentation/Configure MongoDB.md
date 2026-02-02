# Configure a local MongoDB Docker container as a replica set

## Prerequisites
- Docker
- OpenSSL  
- MongoDB Shell (mongosh)

### Verify Installation
Run these commands to check if the required tools are installed:
```bash
docker --version
openssl version
mongosh --version
```

> **Note:** If any of these commands fail, install the missing tool before proceeding.

## 1 - Create a new directory

Create a new directory for MongoDB setup:
```bash
mkdir mongodb-docker
cd mongodb-docker
```

> **Why:** This new directory will be used to store resources for the MongoDB docker container.

---

## 2 - Create a keyfile

Open a terminal and navigate to the mongodb-docker directory. Then run the following commands:
```bash
openssl rand -base64 756 > keyfile.txt
chmod 400 keyfile.txt
chown 999:999 keyfile.txt
```

> **Why:** This step creates a keyfile for MongoDB authentication and sets the appropriate ownership and permissions. A keyfile is required when MongoDB is configured as a replica set.

---

## 3 - Create the MongoDB docker container

Start Docker if it is not already running. Verify you are still in the mongodb-docker directory, then run the following docker command:
```bash
docker run -d \
  --name mongo \
  --restart unless-stopped \
  -e MONGO_INITDB_ROOT_USERNAME=user \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  -p 27017:27017 \
  -v ./mongo-data:/data/db \
  -v ./keyfile.txt:/etc/mongo-keyfile:ro \
  mongo:7.0 \
  --replSet rs0 \
  --keyFile /etc/mongo-keyfile \
  --bind_ip_all \
  --auth
```

> **Why:** This creates and starts a MongoDB docker container with replica set configuration, authentication enabled, and data persistence.

---

## 4 - Configure MongoDB

Connect to the new MongoDB instance using mongosh:
```bash
mongosh mongodb://user:password@localhost:27017/
```

Once connected, run the following commands in the MongoDB shell:
```javascript
use admin;
rs.initiate();
cfg = rs.conf();
cfg.members[0].host = 'localhost:27017';
rs.reconfig(cfg, {force: true});
exit;
```

> **Why:** This connects to the MongoDB instance, initializes it as a replica set, and configures it for local connections. The MongoDB instance is now configured and ready for data loading.