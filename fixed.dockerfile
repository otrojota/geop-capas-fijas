# docker run --mount type=bind,source=/Volumes/JSamsung/geoportal/gfs4/data,target=/home/data --mount type=bind,source=/Volumes/JSamsung/geoportal/gfs4/publish,target=/home/publish otrojota/geoportal:gfs4
# docker run --mount type=bind,source=/var/geoportal/fixed,target=/home/data --mount type=bind,source=/var/geoportal/fixed/publish,target=/home/publish -d otrojota/geoportal:capas-fijas-0.11
FROM otrojota/geoportal:gdal-nodejs-1.01
WORKDIR /opt/geoportal/geop-capas-fijas
COPY . .
RUN npm install 
EXPOSE 8184
CMD node index.js