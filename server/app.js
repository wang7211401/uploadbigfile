const http = require('http')
const multiparty = require('multiparty')// 中间件，处理FormData对象的中间件
const path = require('path')
const fse = require('fs-extra')//文件处理模块
const fs = require('fs')
const md5 = require('md5')

const server = http.createServer()
const UPLOAD_DIR = path.resolve(__dirname, '.', 'qiepian')// 读取根目录，创建一个文件夹qiepian存放切片

server.on('request', async (req, res) => {
    // 处理跨域问题，允许所有的请求头和请求源
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.writeHead(200,{'Content-Type':'text/plain;charset=utf-8'})

    if (req.url === '/upload') { //前端访问的地址正确
        const multipart = new multiparty.Form() // 解析FormData对象
        multipart.parse(req, async (err, fields, files) => {
            if (err) { //解析失败
                return
            }
           
            const [file] = files.file
            const [fileName] = fields.fileName
            const [chunkName] = fields.chunkName
            const fileId = md5(fileName)

            let extname=path.extname(fileName);
            let fileIdName = `${fileId}${extname}`

            const chunkDir = path.resolve(UPLOAD_DIR, `${fileIdName}-chunks`)//在qiepian文件夹创建一个新的文件夹，存放接收到的所有切片
            if (!fse.existsSync(chunkDir)) { //文件夹不存在，新建该文件夹
                await fse.mkdirs(chunkDir)
            }

            let fileChunkName = `${fileIdName}_${chunkName}`
            // 把切片移动进chunkDir
            await fse.move(file.path, `${chunkDir}/${fileChunkName}`)
            res.end(JSON.stringify({ //向前端输出
                code: 0,
                data:{
                    id:fileId
                },
                message: '切片上传成功'
            }))
        })
    }

    if (req.url === '/merge') { // 该去合并切片了
        try{
            const data = await resolvePost(req)
            const {
                id,
                fileName,
                size
            } = data

            let extname=path.extname(fileName);
            let fileIdName = `${id}${extname}`
            const filePath = path.resolve(UPLOAD_DIR, fileIdName)//获取切片路径
            await mergeFileChunk(filePath, fileIdName, size)
            res.end(JSON.stringify({
                code: 0,
                message: '文件合并成功'
            }))
        }catch(err){
            console.log("err",err)
            res.end(JSON.stringify({
                code: 1,
                message: err
            }))
        }
       
    }

    if(req.url === '/detectfileupload'){
        try{
            const data = await resolvePost(req)
            const {
                fileName,
                fileSize
            } = data

            console.log("data",data)
            const fileId = md5(fileName)

            let extname=path.extname(fileName);
            let fileIdName = `${fileId}${extname}`
    
            const fileNamePath = path.resolve(UPLOAD_DIR, fileIdName)
            console.log("fileIdName-exists",fse.existsSync(fileIdName))
            if(fse.existsSync(fileNamePath)){
                res.end(JSON.stringify({ //向前端输出
                    code: 101,
                    data:{
                        id:fileId
                    },
                    message: '文件已经上传'
                })) 
            }else{
                res.end(JSON.stringify({ //向前端输出
                    code: 0,
                    data:{
                        id:fileId
                    },
                    message: '文件未上传'
                })) 
            }
        }catch(err){
            console.log("err",err)
            res.end(JSON.stringify({
                code: 1,
                message: err
            }))
        }
    
    }
})

// 合并
async function mergeFileChunk(filePath, fileName, size) {
    const chunkDir = path.resolve(UPLOAD_DIR, `${fileName}-chunks`)

    let chunkPaths = await fse.readdir(chunkDir)
    chunkPaths.sort((a, b) => a.split('_')[1] - b.split('_')[1])

    const arr = chunkPaths.map((chunkPath, index) => {
        return pipeStream(
            path.resolve(chunkDir, chunkPath),
            // 在指定的位置创建可写流
            fs.createWriteStream(filePath, {
                start: index * size,
                end: (index + 1) * size
            })
        )
    })
    await Promise.all(arr)//保证所有的切片都被读取
    fse.removeSync(chunkDir)
}

// 将切片转换成流进行合并
function pipeStream(path, writeStream) {
    return new Promise(resolve => {
        // 创建可读流，读取所有切片
        const readStream = fs.createReadStream(path)
        readStream.on('end', () => {
            fs.unlinkSync(path)// 读取完毕后，删除已经读取过的切片路径
            resolve()
        })
        readStream.pipe(writeStream)//将可读流流入可写流
    })
}
// ​
// 解析POST请求传递的参数
function resolvePost(req) {
    // 解析参数
    return new Promise(resolve => {
        let chunk = ''
        req.on('data', data => { //req接收到了前端的数据
            chunk += data //将接收到的所有参数进行拼接
        })
        req.on('end', () => {
            resolve(JSON.parse(chunk))//将字符串转为JSON对象
        })
        req.on('error', (err) => {
            reject(err)//将字符串转为JSON对象
        })
    })
}

server.listen(3000, () => {
    console.log('服务已启动');
})