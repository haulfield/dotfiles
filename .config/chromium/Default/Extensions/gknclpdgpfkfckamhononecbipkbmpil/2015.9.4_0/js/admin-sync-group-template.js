if (!!!templates) var templates = {};
templates["admin-sync-group-template"] = new Hogan.Template({code: function (c,p,i) { var t=this;t.b(i=i||"");t.b("<h4>Group name: ");t.b(t.v(t.f("groupName",c,p,0)));t.b(" </h4>");t.b("\n" + i);t.b("<table border=\"1\"> ");t.b("\n" + i);t.b("<tr><th>Users added to group</th><th>Users removed from group</th></tr>");t.b("\n" + i);t.b("<tr>");t.b("\n" + i);t.b("<td>");t.b("\n" + i);t.b("<ul>");t.b("\n" + i);if(t.s(t.f("newUsers",c,p,1),c,p,0,160,188,"{{ }}")){t.rs(c,p,function(c,p,t){t.b("        <li>");t.b(t.v(t.d(".",c,p,0)));t.b("</li>");t.b("\n" + i);});c.pop();}t.b("</ul>");t.b("\n" + i);t.b("</td>");t.b("\n" + i);t.b("<td>");t.b("\n" + i);t.b("<ul>");t.b("\n" + i);if(t.s(t.f("deletedUsers",c,p,1),c,p,0,245,273,"{{ }}")){t.rs(c,p,function(c,p,t){t.b("        <li>");t.b(t.v(t.d(".",c,p,0)));t.b("</li>");t.b("\n" + i);});c.pop();}t.b("</ul>");t.b("\n" + i);t.b("</td>");t.b("\n" + i);t.b("</table>");return t.fl(); },partials: {}, subs: {  }});