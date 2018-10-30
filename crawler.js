var request = require('request'),
    cheerio = require('cheerio'),
    fs = require('fs'),
    config = require('./config');
    deasync = require('deasync');

var itemCount = config.itemCount,
    showContents = config.showContents,
    outputType = config.outputType,
    brand = config.brand;

var posts = new Array();

function getArticle(i) {
    console.log("### start ###");
    
    var url = "https://www.lowes.com/search?searchTerm=" + brand + "+washer";

    var sync = true;
    request(url, function (err, res, html) {
        if (err) return console.error(err);

        var $ = cheerio.load(html);
        
        console.log("### crawling ###");
        console.log("### start phase 1 ###");

        var isDone = false;
        var p = i;
        function getContents($, p) {
            // crawl title and link
            console.log("### item " + p + " ###");
            $("div.product-details a.art-pl-productLink" + p).each(function () {
                var post = {"seq": "", "title": "", "link": "", "content": "", "modelcode": "", "price": "", "rating": "", "replycount": "", "replies": new Array()};
                var data = $(this);
        
                var link = data.attr("href");
                if (link.startsWith("/"))
                    link = "https://www.lowes.com" + data.attr("href");
                post["link"] = link;
                var title = data.find("p").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                post["title"] = title;

                posts[p] = post;

                if (showContents) {
                    console.log(link);
                    console.log(title);
                }
            
                isDone = true;
                sync = false;
            });
            
            if (!isDone) {
                console.log("### process end ###");
                process.exit(1);
            }
        
            // write csv header
            if (outputType === 1 && p == 0) {
                fs.writeFile('store_lowes_' + brand + '.csv', 'seq,title,link,content,modelcode,price,rating,replycount,replydate,replybody,replywriter,replyrating\n', 'utf-8', function (err) {
                    if (err) throw err;
                    console.log("### saved header ###");
                });
            }

            while(sync) {
                deasync.sleep(100);
            }
            sync = true;
            
            console.log("### the number of list: " + (p + 1) + " ###");
            console.log("### start phase 2 ###");
            
            var post = posts[p];
            var link = post["link"];
            var sync1 = true;
            request(link, function (err, res, html) {
                if (err) return console.error(err);
                
                var $1 = cheerio.load(html);

                // header
                $1("div.pd-left.grid-50").each(function () {
                    var data = $1(this);

                    var modelcode = data.find("span.met-product-model").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                    post["modelcode"] = modelcode;
                    var rating = data.find("span.js-average-rating").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                    post["rating"] = rating;
                    var replycount = data.find("span.reviews-count").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                    replycount = replycount.substring(0, replycount.indexOf(" Ratings"));
                    post["replycount"] = replycount;
                    
                    if (showContents) {
                        console.log(modelcode);
                        console.log(rating);
                        console.log(replycount);   
                    }

                    sync1 = false;
                });

                // content
                $1("ul.list.disc").each(function () {
                    var data = $1(this);

                    var content = data.text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\""); 
                    post["content"] = content; 

                    if (showContents)
                        console.log(content);
                });

                while(sync1) {
                    deasync.sleep(100);
                }
                sync1 = true;

                var replycountIdx = post["replycount"] - 1;
                var r = 0;
                var offset = 0;
                if (replycountIdx < offset)
                    offset = replycountIdx;
                var isDone = false;
                var replies = new Array();
                post["replies"] = replies;
                var sync2 = true;   
                function getReplies(offset2) {
                    if (offset < offset2)
                        offset = offset2;
                
                    request(link + "/reviews?offset=" + offset, function (err, res, html) {
                        if (err) return console.error(err);
                    
                        var $2 = cheerio.load(html);
        
                        replies = post["replies"];

                        // reply
                        $2("div.review.grid-100").each(function () {
                            var data = $2(this);
                    
                            var reply = {"replydate": "", "replybody": "", "replywriter": "", "replyrating": ""};
        
                            var date = data.find("div.vertical-align-center.padding-left-medium small").text().trim();
                            date = date.substring(date.indexOf("on") + 3, date.length);
                            date = date.substring(6, date.length) + "-" + date.substring(0, 2) + "-" + date.substring(3, 5);
                            reply["replydate"] = date;
                            var writer = data.find("p.user-name").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                            reply["replywriter"] = writer;
                            var body = data.find("div.review-content-wrapper").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                            reply["replybody"] = body;
                            var replyrating = data.find("span.ada.screen-reader-only").text().trim().replace(/\r\n|\n|\r|\t/g,"").replace(/\"/g,"\"\"");
                            replyrating = replyrating.substring(replyrating.indexOf("Rating") + 7, replyrating.indexOf(" Stars"));
                            reply["replyrating"] = replyrating;
        
                            replies[r] = reply;
                            r++;

                            if (showContents) {
                                console.log(date);
                                console.log(writer);
                                console.log(body);
                                console.log(replyrating);
                            }

                            post["seq"] = brand + "_" + p + "_" + r;
                            post["replies"] = replies;

                            // write
                            // seq,title,link,content,modelcode,price,rating,replycount,replydate,replybody,replywriter,replyrating
                            if (outputType === 0) {
                                // write json
                                fs.appendFile('store_lowes.json',  JSON.stringify(post) + ',\n', 'utf-8', function (err) {
                                    if (err) throw err;
                                    else console.log("### saved item and reply " + r + " ###");
                                });
                            } else if (outputType === 1) {
                                // write csv
                                fs.appendFile('store_lowes_' + brand + '.csv',  '"' + post["seq"] + '","' + post["title"] + '","' + post["link"] + '","' + post["content"] + 
                                '","' + post["modelcode"] + '","' + post["price"] + '","' + post["rating"] + '","' + post["replycount"] + '","' + reply["replydate"] + 
                                '","' + reply["replybody"] + '","' + reply["replywriter"] + '","' + reply["replyrating"] + '","lowes"\n', 'utf-8', function (err) {
                                    if (err) throw err;
                                    else console.log("### saved item and reply " + r + " ###");
                                });
                            }
                        });
                        posts[p] = post;
        
                        if (!isDone) {
                            if (replycountIdx > offset) {
                                offset = offset + 10;
                                getReplies(offset);
                            } else {
                                isDone = true;
                                sync2 = false;
                            }
                        } 
                    });
                }
                if (!isDone) {
                    getReplies(offset);
                }

                while(sync2) {
                    deasync.sleep(100);
                }
                sync2 = true;

                console.log("### process end ###");
            });
        }
        getContents($, p);
    });
};
for (var i = 0; i < itemCount; i++) {
    getArticle(i);
}